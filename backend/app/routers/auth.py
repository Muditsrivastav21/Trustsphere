"""
TrustSphere AI — Auth Router
POST /api/auth/login      — full trust evaluation pipeline
POST /api/auth/verify-otp — OTP verification
"""


from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.concurrency import run_in_threadpool

from app.models.requests import LoginRequest, VerifyOtpRequest, ContinuousAuthRequest
from app.models.responses import (
    LoginResponse, UserInfo, LocationInfo, ComponentScores, OtpVerifyResponse,
)
from app.engines.fingerprint_engine import evaluate_device
from app.engines.behavior_engine import evaluate_behavior
from app.engines.network_engine import evaluate_network
from app.engines.scoring_engine import calculate_trust_score
from app.services.session_service import (
    create_login_event, create_behavioral_metrics,
    upsert_device_fingerprint, create_audit_log, get_user_by_auth_id,
    get_or_create_user_profile, is_token_stale,
)
from app.services.graph_service import write_login_to_graph
from app.services.otp_service import generate_otp, store_otp, verify_otp, send_email_otp
from app.utils.session_id import generate_session_id
from app.utils.logger import logger
from app.utils.rate_limiter import limiter

from app.database.supabase_client import get_supabase

router = APIRouter()
security = HTTPBearer()

def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    sb = get_supabase()
    try:
        auth_response = sb.auth.get_user(creds.credentials)
        if not auth_response or not auth_response.user:
            raise ValueError()
        auth_id = auth_response.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid session token")

    user = get_user_by_auth_id(auth_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if is_token_stale(creds.credentials, user):
        raise HTTPException(status_code=401, detail="Session expired due to a recent password change. Please sign in again.")

    return user

@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {"role": current_user.get("role", "customer")}

@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")
async def login(request: Request, req: LoginRequest, background_tasks: BackgroundTasks, creds: HTTPAuthorizationCredentials = Depends(security)):
    """Full identity trust evaluation pipeline."""
    token = creds.credentials
    sb = get_supabase()

    # Verify JWT and look up (or auto-create) user profile
    try:
        auth_response = await run_in_threadpool(sb.auth.get_user, token)
        if not auth_response or not auth_response.user:
            raise ValueError("No user found")
        auth_id = auth_response.user.id
        auth_email = auth_response.user.email
        auth_meta = getattr(auth_response.user, "user_metadata", {}) or {}
    except Exception as e:
        logger.error(f"JWT Verification failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid session token")

    user = await run_in_threadpool(get_or_create_user_profile, auth_id, email=auth_email, user_metadata=auth_meta)
    if not user:
        raise HTTPException(status_code=500, detail="Could not resolve or create user profile.")

    user_id = user["id"]
    req.customer_id = user["customer_id"]

    # 2. Device signals → dict
    device_dict = req.device.model_dump()

    # 3. Fingerprint engine
    device_result = await run_in_threadpool(evaluate_device, user_id, device_dict)

    # 4. Behavior engine
    behavior_dict = req.behavior.model_dump()
    behavior_result = await run_in_threadpool(evaluate_behavior, behavior_dict)

    # 5. Network engine (async)
    network_result = await evaluate_network(req.ip_address, user_id)

    # 6. Scoring engine
    score_result = await run_in_threadpool(
        calculate_trust_score,
        device_result["device_score"],
        behavior_result["behavior_score"],
        network_result["network_score"],
    )

    # Bypass OTP for analyst users
    if user.get("role") == "analyst" and score_result["auth_action"] == "OTP":
        score_result["auth_action"] = "ALLOW"

    # 7. Generate session ID
    session_id = generate_session_id()

    # 8. Merge all flags
    all_flags = (
        device_result["flags"]
        + behavior_result["flags"]
        + network_result["flags"]
    )

    # Determine if fraud flagged (network_score < 50 means flagged IP)
    is_fraud_flagged = network_result["network_score"] < 50

    now = datetime.now(timezone.utc)
    timestamp_str = now.isoformat()

    location = network_result["location"]

    # 8.5 Set home region baseline if not set yet
    if not user.get("home_country") or not user.get("home_timezone"):
        home_country = location.get("country") or "IN"
        home_tz = device_dict.get("timezone") or "Asia/Kolkata"
        try:
            from app.services.session_service import update_user_home_region
            background_tasks.add_task(
                update_user_home_region,
                user_id,
                home_country,
                home_tz
            )
        except Exception as e:
            logger.warning(f"Failed to schedule home region update: {e}")

    # 9. INSERT login_events (triggers Supabase Realtime)
    try:
        await run_in_threadpool(create_login_event, {
            "session_id": session_id,
            "user_id": user_id,
            "customer_id": req.customer_id,
            "user_name": user.get("name") or "New User",
            "timestamp": timestamp_str,
            "ip_address": req.ip_address,
            "country": location.get("country") or "",
            "city": location.get("city") or "",
            "device_hash": device_result["fingerprint_hash"],
            "is_known_device": device_result["is_known_device"],
            "device_score": device_result["device_score"],
            "behavior_score": behavior_result["behavior_score"],
            "network_score": network_result["network_score"],
            "trust_score": score_result["trust_score"],
            "risk_level": score_result["risk_level"],
            "auth_action": score_result["auth_action"],
            "typing_speed_wpm": behavior_result.get("typing_speed_wpm", 0),
            "avg_hold_time_ms": behavior_result.get("avg_hold_time_ms", 0),
            "mouse_speed_avg": behavior_result.get("mouse_speed_avg", 0),
            "anomaly_score": behavior_result.get("anomaly_score", 0),
            "flags": all_flags,
            "is_fraud_flagged": is_fraud_flagged,
        })
    except Exception as e:
        logger.error(f"Failed to insert login event: {e}")
        raise HTTPException(status_code=500, detail="Failed to record login event")

    # 10. INSERT behavioral_metrics
    try:
        background_tasks.add_task(create_behavioral_metrics, {
            "session_id": session_id,
            "key_hold_times": req.behavior.key_hold_times,
            "flight_times": req.behavior.flight_times,
            "typing_speed_wpm": req.behavior.typing_speed_wpm,
            "mouse_speeds": req.behavior.mouse_speeds,
            "mouse_event_count": req.behavior.mouse_event_count,
            "total_keystrokes": req.behavior.total_keystrokes,
            "anomaly_score": behavior_result.get("anomaly_score", 0),
            "is_anomalous": "BEHAVIORAL_ANOMALY" in all_flags,
        })
    except Exception as e:
        logger.warning(f"Failed to insert behavioral metrics: {e}")

    # 11. UPSERT device_fingerprints
    try:
        background_tasks.add_task(upsert_device_fingerprint, user_id, device_result["fingerprint_hash"], device_dict)
    except Exception as e:
        logger.warning(f"Failed to upsert device fingerprint: {e}")

    # 12. Audit log for HIGH / CRITICAL
    if score_result["risk_level"] in ("HIGH", "CRITICAL"):
        try:
            background_tasks.add_task(
                create_audit_log,
                event_type="HIGH_RISK_LOGIN",
                description=f"High-risk login detected for {req.customer_id} "
                            f"(score={score_result['trust_score']}, risk={score_result['risk_level']})",
                metadata={
                    "session_id": session_id,
                    "customer_id": req.customer_id,
                    "trust_score": score_result["trust_score"],
                    "flags": all_flags,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to create audit log: {e}")

    # 13. Generate OTP if needed
    user_email = (user.get("email") or auth_email or "").strip().lower()
    is_real_gmail = bool(user_email and user_email.endswith("@gmail.com"))

    generated_otp_code = None
    if score_result["auth_action"] == "OTP":
        try:
            generated_otp_code = generate_otp()
            store_otp(session_id, generated_otp_code)
            logger.info(f"OTP generated for session {session_id}")
            # Send the OTP via Email asynchronously!
            if user_email:
                background_tasks.add_task(send_email_otp, user_email, generated_otp_code)
        except Exception as e:
            logger.warning(f"Failed to generate/send OTP: {e}")

    # 14. Write to Neo4j graph (fire-and-forget via BackgroundTasks)
    try:
        background_tasks.add_task(
            write_login_to_graph,
            customer_id=req.customer_id,
            name=user.get("name") or "New User",
            fingerprint_hash=device_result["fingerprint_hash"],
            user_agent=req.device.user_agent,
            ip_address=req.ip_address,
            is_flagged=any(f.startswith("FLAGGED_IP") for f in all_flags),
            is_fraud_flagged=is_fraud_flagged,
            city=user.get("city") or "",
            email=user_email,
        )
    except Exception as e:
        logger.warning(f"Neo4j graph write task scheduling failed: {e}")

    # Only return OTP to client for demo accounts (not real gmail ones)
    demo_otp_response = None
    if generated_otp_code and not is_real_gmail:
        demo_otp_response = generated_otp_code

    # 15. Return response
    return LoginResponse(
        session_id=session_id,
        user=UserInfo(
            name=user.get("name") or "New User",
            customer_id=req.customer_id,
            city=user.get("city") or "",
            account_type=user.get("account_type") or "Savings",
        ),
        trust_score=score_result["trust_score"],
        risk_level=score_result["risk_level"],
        auth_action=score_result["auth_action"],
        component_scores=ComponentScores(
            device=device_result["device_score"],
            behavior=behavior_result["behavior_score"],
            network=network_result["network_score"],
        ),
        flags=all_flags,
        is_known_device=device_result["is_known_device"],
        location=LocationInfo(
            country=location.get("country") or "",
            city=location.get("city") or "",
            ip=req.ip_address,
        ),
        timestamp=timestamp_str,
        demo_otp=demo_otp_response,
    )


@router.post("/verify-otp", response_model=OtpVerifyResponse)
@limiter.limit("3/minute")
def verify_otp_endpoint(request: Request, req: VerifyOtpRequest):
    """Verify a 6-digit OTP for a given session."""
    verified, message = verify_otp(req.session_id, req.otp_code)
    if verified:
        try:
            create_audit_log(
                event_type="OTP_VERIFIED",
                description=f"OTP verified for session {req.session_id}",
                metadata={"session_id": req.session_id},
            )
        except Exception:
            pass
    return OtpVerifyResponse(verified=verified, message=message)


@router.post("/continuous")
def continuous_auth(req: ContinuousAuthRequest):
    """Evaluates behavior signals continuously post-login."""
    behavior_dict = req.behavior.model_dump()
    behavior_result = evaluate_behavior(behavior_dict)

    status = "VERIFIED"
    if behavior_result["behavior_score"] < 50:
        status = "SUSPICIOUS"

    from app.services.session_service import evaluate_mid_session_hijack
    device_dict = req.device.model_dump() if req.device else None
    
    hijack_flags = evaluate_mid_session_hijack(
        session_id=req.session_id,
        current_ip=req.ip_address,
        current_device_dict=device_dict,
        current_behavior_score=behavior_result["behavior_score"]
    )
    
    all_flags = behavior_result["flags"] + hijack_flags
    if hijack_flags:
        status = "BLOCK" if "MID_SESSION_DEVICE_CHANGE" in hijack_flags or "MID_SESSION_IP_CHANGE" in hijack_flags else "SUSPICIOUS"

    return {"status": status, "score": behavior_result["behavior_score"], "flags": all_flags}

@router.post("/freeze")
def freeze_account(current_user: dict = Depends(get_current_user)):
    """Emergency Kill Switch: Freeze the user's account."""
    sb = get_supabase()
    
    sb.table("users").update({"risk_profile": "FROZEN"}).eq("id", current_user["id"]).execute()
    
    from app.services.session_service import create_audit_log
    create_audit_log(
        event_type="ACCOUNT_FROZEN",
        description="User triggered emergency kill switch.",
        metadata={"user_id": current_user["id"], "customer_id": current_user.get("customer_id")}
    )
    
    return {"status": "success", "message": "Account has been frozen."}

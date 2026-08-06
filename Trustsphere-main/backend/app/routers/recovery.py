"""
TrustSphere AI — Account Recovery Router
POST /api/recovery/initiate
POST /api/recovery/verify
"""

import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, BackgroundTasks
from starlette.concurrency import run_in_threadpool

from app.models.requests import RecoveryInitRequest, RecoveryVerifyRequest
from app.models.responses import RecoveryInitResponse, OtpVerifyResponse
from app.engines.recovery_engine import evaluate_recovery_risk
from app.utils.hashing import generate_fingerprint_hash
from app.utils.session_id import generate_session_id
from app.utils.logger import logger
from app.database.supabase_client import get_supabase
from app.services.session_service import create_login_event, create_audit_log
from app.services.otp_service import generate_otp, store_otp, send_email_otp, verify_otp
from app.utils.rate_limiter import limiter
from fastapi import Request

router = APIRouter()

def _get_user_by_email(email: str) -> dict | None:
    sb = get_supabase()
    res = sb.table("users").select("*").eq("email", email).limit(1).execute()
    if res.data:
        return res.data[0]
    return None

@router.post("/initiate", response_model=RecoveryInitResponse)
@limiter.limit("5/minute")
async def initiate_recovery(request: Request, req: RecoveryInitRequest, background_tasks: BackgroundTasks):
    """Evaluate recovery risk and trigger reset flow."""
    user = await run_in_threadpool(_get_user_by_email, req.email)
    user_id = user["id"] if user else None
    customer_id = user["customer_id"] if user else "UNKNOWN"
    user_name = user["name"] if user else "Unknown User"

    # Compute device hash
    device_hash = generate_fingerprint_hash(
        req.device.user_agent,
        req.device.timezone,
        req.device.screen_res,
        req.device.language,
        req.device.platform
    )
    
    # 1. Run Engine
    result = await run_in_threadpool(
        evaluate_recovery_risk,
        user_id=user_id,
        email=req.email,
        ip_address=req.ip_address,
        device_hash=device_hash,
        recovery_channel=req.recovery_channel
    )
    
    session_id = generate_session_id()
    decision = result["decision"]
    risk_score = result["risk_score"]
    reason_codes = result["reason_codes"]
    
    # 2. Log Candidate ATO Event to Session Inspector
    now_str = datetime.now(timezone.utc).isoformat()
    try:
        await run_in_threadpool(create_login_event, {
            "session_id": session_id,
            "user_id": user_id,
            "customer_id": customer_id,
            "user_name": user_name,
            "timestamp": now_str,
            "ip_address": req.ip_address,
            "country": "",
            "city": "",
            "device_hash": device_hash,
            "is_known_device": user_id is not None and "UNRECOGNIZED_DEVICE" not in reason_codes,
            "device_score": 100 if "UNRECOGNIZED_DEVICE" not in reason_codes else 0,
            "behavior_score": 100,
            "network_score": 100 if "HIGH_RECOVERY_VELOCITY" not in reason_codes else 0,
            "trust_score": risk_score,
            "risk_level": "CRITICAL" if decision == "BLOCK" else ("HIGH" if decision == "STEP_UP" else "LOW"),
            "auth_action": f"RECOVERY_{decision}",
            "typing_speed_wpm": req.behavior.typing_speed_wpm,
            "avg_hold_time_ms": 0,
            "mouse_speed_avg": 0,
            "anomaly_score": 0,
            "flags": reason_codes,
            "is_fraud_flagged": decision == "BLOCK",
        })
    except Exception as e:
        logger.error(f"Failed to insert recovery login event: {e}")

    # 3. Actions based on decision
    message = "Recovery initiated successfully."
    
    if decision in ("ALLOW", "STEP_UP"):
        if decision == "STEP_UP":
            message = "Additional verification required due to elevated risk."
            
        if user:
            # Generate and send OTP
            try:
                otp_code = generate_otp()
                store_otp(session_id, otp_code)
                background_tasks.add_task(send_email_otp, req.email, otp_code)
            except Exception as e:
                logger.warning(f"Failed to generate/send recovery OTP: {e}")
    else:
        message = "Account recovery blocked due to suspicious activity. Please contact support."
        # Audit Log
        if user:
            background_tasks.add_task(
                create_audit_log,
                event_type="RECOVERY_BLOCKED",
                description=f"Blocked recovery attempt for {req.email}",
                metadata={"session_id": session_id, "flags": reason_codes}
            )

    return RecoveryInitResponse(
        session_id=session_id,
        decision=decision,
        risk_score=risk_score,
        reason_codes=reason_codes,
        message=message
    )

@router.post("/verify", response_model=OtpVerifyResponse)
def verify_recovery(req: RecoveryVerifyRequest):
    """Verify OTP for recovery."""
    verified, message = verify_otp(req.session_id, req.otp_code)
    if verified:
        try:
            create_audit_log(
                event_type="RECOVERY_VERIFIED",
                description=f"Recovery OTP verified for session {req.session_id}",
                metadata={"session_id": req.session_id},
            )
        except Exception:
            pass
    return OtpVerifyResponse(verified=verified, message=message)

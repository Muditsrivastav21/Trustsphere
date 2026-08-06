"""
TrustSphere AI — Account Recovery Router
POST /api/recovery/initiate
POST /api/recovery/verify
POST /api/recovery/reset-password
"""

import re
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, BackgroundTasks
from starlette.concurrency import run_in_threadpool

from app.models.requests import RecoveryInitRequest, RecoveryVerifyRequest, ResetPasswordRequest
from app.models.responses import RecoveryInitResponse, OtpVerifyResponse, ResetPasswordResponse
from app.engines.recovery_engine import evaluate_recovery_risk
from app.utils.hashing import generate_fingerprint_hash
from app.utils.session_id import generate_session_id
from app.utils.logger import logger
from app.database.supabase_client import get_supabase
from app.services.session_service import create_login_event, create_audit_log, get_login_event_by_session, get_user_by_id
from app.services.otp_service import generate_otp, store_otp, send_email_otp, verify_otp, send_password_changed_email
from app.utils.rate_limiter import limiter
from fastapi import Request

router = APIRouter()

# How long after OTP verification a reset-password call is still accepted.
# Prevents a verified-hours-or-days-ago session from being replayed to reset
# a password long after the user's original recovery attempt.
RESET_WINDOW_MINUTES = 10

# Small, non-exhaustive common-password blocklist — enough to reject the
# most obvious choices for a hackathon demo, not a substitute for a real
# breached-password API.
_COMMON_PASSWORDS = {
    "password", "password1", "12345678", "123456789", "qwerty123",
    "letmein", "welcome1", "admin123", "iloveyou", "monkey123",
    "football", "baseball", "dragon123", "master123", "trustno1",
    "sunshine", "princess", "abc12345", "passw0rd", "changeme",
}


def _validate_new_password(password: str) -> str | None:
    """Return a specific error message if the password is too weak, else None."""
    if len(password) < 8:
        return "Password must be at least 8 characters long."
    if password.isdigit():
        return "Password cannot be entirely numeric."
    if password.lower() in _COMMON_PASSWORDS:
        return "This password is too common. Please choose a stronger one."
    if not re.search(r"[A-Za-z]", password):
        return "Password must contain at least one letter."
    return None

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
@limiter.limit("3/minute")
def verify_recovery(request: Request, req: RecoveryVerifyRequest):
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


@router.post("/reset-password", response_model=ResetPasswordResponse)
@limiter.limit("5/minute")
def reset_password(request: Request, req: ResetPasswordRequest, background_tasks: BackgroundTasks):
    """
    Actually reset the user's password after a verified recovery OTP.

    Invariant (Phase 2): this endpoint is only reachable after a STEP_UP or
    ALLOW decision from evaluate_recovery_risk(). A BLOCK decision never
    generates or sends an OTP (see initiate_recovery's `if decision in
    ("ALLOW", "STEP_UP")` branch above) — so a BLOCKed attempt has no
    otp_sessions row at all, and the `used == True` check below can never
    pass for it. There is no path from BLOCK to a successful reset, even
    with a fabricated session_id, because there's nothing for that
    fabricated session_id to match. Verified by test (Phase 4).
    """
    sb = get_supabase()

    # 1. The OTP for this session must have actually been verified already.
    otp_row_res = (
        sb.table("otp_sessions")
        .select("*")
        .eq("session_id", req.session_id)
        .limit(1)
        .execute()
    )
    if not otp_row_res.data:
        raise HTTPException(status_code=400, detail="No matching recovery session found.")

    otp_row = otp_row_res.data[0]
    if not otp_row.get("used"):
        raise HTTPException(status_code=400, detail="OTP has not been verified for this session.")

    # 2. The verification must have happened recently — not replayed from
    # a long-since-verified session.
    verified_at_str = otp_row.get("verified_at")
    if not verified_at_str:
        # Verified before this column existed, or something went wrong writing it.
        raise HTTPException(status_code=400, detail="Verification window has expired. Please restart the recovery process.")

    verified_at = datetime.fromisoformat(verified_at_str.replace("Z", "+00:00"))
    if datetime.now(timezone.utc) - verified_at > timedelta(minutes=RESET_WINDOW_MINUTES):
        raise HTTPException(status_code=400, detail="Verification window has expired. Please restart the recovery process.")

    # 3. A verified OTP session can only reset a password once.
    if otp_row.get("password_reset_at"):
        raise HTTPException(status_code=400, detail="This recovery session has already been used to reset a password.")

    # 4. Server-side password strength validation.
    validation_error = _validate_new_password(req.new_password)
    if validation_error:
        raise HTTPException(status_code=400, detail=validation_error)

    # 5. Resolve the user via the login_events row created in initiate_recovery
    # — threading the same connection through rather than re-looking-up by
    # email, which could resolve to a different user if account details
    # ever changed between initiate and reset.
    login_event = get_login_event_by_session(req.session_id)
    user_id = login_event.get("user_id") if login_event else None
    if not user_id:
        raise HTTPException(status_code=400, detail="Could not resolve the account for this recovery session.")

    user = get_user_by_id(user_id)
    if not user or not user.get("email"):
        raise HTTPException(status_code=400, detail="Could not resolve the account for this recovery session.")

    # 6. Call Supabase's admin API to actually set the new password.
    # Confirmed against the installed gotrue 2.12.3 source
    # (gotrue/_sync/gotrue_admin_api.py): update_user_by_id(uid, attributes)
    # exists, and AdminUserAttributes accepts a "password" key.
    try:
        sb.auth.admin.update_user_by_id(user_id, {"password": req.new_password})
    except Exception as e:
        logger.error(f"Supabase admin password update failed for user {user_id}: {e}")
        # Do NOT mark the otp_session consumed — a transient failure here
        # shouldn't lock the user out of retrying.
        raise HTTPException(status_code=502, detail="Could not update your password right now. Please try again.")

    now_str = datetime.now(timezone.utc).isoformat()

    # 7. Session invalidation fallback (see session_service.is_token_stale
    # for why this is a fallback and not real revocation).
    try:
        sb.table("users").update({"password_changed_at": now_str}).eq("id", user_id).execute()
    except Exception as e:
        logger.warning(f"Failed to stamp password_changed_at for user {user_id}: {e}")

    # Mark this OTP session consumed — only after the password update succeeded.
    try:
        sb.table("otp_sessions").update({"password_reset_at": now_str}).eq("session_id", req.session_id).execute()
    except Exception as e:
        logger.warning(f"Failed to stamp password_reset_at for session {req.session_id}: {e}")

    # 8. Audit log.
    try:
        create_audit_log(
            event_type="PASSWORD_RESET_COMPLETED",
            description=f"Password reset completed for user {user_id}",
            metadata={
                "user_id": user_id,
                "session_id": req.session_id,
                "ip_address": req.ip_address,
                "timestamp": now_str,
            },
        )
    except Exception as e:
        logger.warning(f"Failed to write PASSWORD_RESET_COMPLETED audit log: {e}")

    # 9. Notify the account's actual registered email — never anything from
    # the request body — that the password was changed.
    background_tasks.add_task(send_password_changed_email, user["email"])

    return ResetPasswordResponse(success=True, message="Password updated successfully. Please sign in with your new password.")

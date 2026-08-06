"""
TrustSphere AI — Account Recovery Risk Engine
Evaluates password recovery attempts based on device mismatch, velocity, and channel risk.
"""

from __future__ import annotations
from datetime import datetime, timedelta, timezone

from app.database.supabase_client import get_supabase
from app.utils.logger import logger

def _check_device_mismatch(user_id: str, device_hash: str) -> bool:
    """Returns True if the device hash is NOT in the user's known device list."""
    if not user_id:
        return True
    
    try:
        sb = get_supabase()
        res = sb.table("device_fingerprints").select("id").eq("user_id", user_id).eq("fingerprint_hash", device_hash).execute()
        
        # If no rows found, it's a mismatch
        if not res.data:
            return True
        return False
    except Exception as e:
        logger.warning(f"Device mismatch check failed: {e}")
        return True

def _check_velocity(ip_address: str, device_hash: str) -> int:
    """Returns the number of recent recovery attempts from this IP or device."""
    try:
        sb = get_supabase()
        fifteen_mins_ago = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
        
        # Count recovery attempts in login_events (where auth_action starts with RECOVERY_)
        res_ip = sb.table("login_events").select("id", count="exact").eq("ip_address", ip_address).like("auth_action", "RECOVERY_%").gte("timestamp", fifteen_mins_ago).execute()
        res_device = sb.table("login_events").select("id", count="exact").eq("device_hash", device_hash).like("auth_action", "RECOVERY_%").gte("timestamp", fifteen_mins_ago).execute()
        
        count_ip = res_ip.count if res_ip.count is not None else len(res_ip.data)
        count_device = res_device.count if res_device.count is not None else len(res_device.data)
        
        return max(count_ip, count_device)
    except Exception as e:
        logger.warning(f"Velocity check failed: {e}")
        return 0

def evaluate_recovery_risk(
    user_id: str | None,
    email: str,
    ip_address: str,
    device_hash: str,
    recovery_channel: str
) -> dict:
    """
    Score the recovery attempt from 0 (High Risk) to 100 (Trusted).
    """
    score = 100
    reason_codes: list[str] = []

    # 1. Device Mismatch
    if _check_device_mismatch(user_id, device_hash):
        score -= 40
        reason_codes.append("UNRECOGNIZED_DEVICE")

    # 2. Velocity (Credential Stuffing / Brute Force Protection)
    velocity = _check_velocity(ip_address, device_hash)
    if velocity >= 3:
        score -= 60
        reason_codes.append("HIGH_RECOVERY_VELOCITY")
    elif velocity == 2:
        score -= 30
        reason_codes.append("ELEVATED_RECOVERY_VELOCITY")

    # 3. Channel Risk
    channel = recovery_channel.upper()
    if channel == "SMS":
        score -= 10
        reason_codes.append("SMS_CHANNEL_RISK")
    elif channel == "SECURITY_QUESTIONS":
        score -= 20
        reason_codes.append("WEAK_RECOVERY_CHANNEL")

    # Clamp score
    score = max(0, min(100, int(score)))

    # Determine decision
    if score >= 80:
        decision = "ALLOW"
    elif score >= 50:
        decision = "STEP_UP"
    else:
        decision = "BLOCK"

    return {
        "risk_score": score,
        "decision": decision,
        "reason_codes": reason_codes
    }

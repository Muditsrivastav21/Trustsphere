"""
TrustSphere AI — Onboarding/KYC Risk Engine
Evaluates onboarding/signup risk based on PII consistency,
device velocity, and behavioral bot signals.
"""

from __future__ import annotations
import re
from datetime import datetime, timedelta, timezone
from app.database.supabase_client import get_supabase
from app.utils.hashing import generate_fingerprint_hash
from app.utils.logger import logger

DISPOSABLE_DOMAINS = {"mailinator.com", "10minutemail.com", "tempmail.com", "guerrillamail.com", "sharklasers.com"}

def _check_velocity(device_hash: str, ip_address: str) -> int:
    """Check how many signups happened from this device/IP in the last hour."""
    try:
        sb = get_supabase()
        one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        
        # In Supabase, we can just fetch and count
        res_device = sb.table("onboarding_attempts").select("id", count="exact").eq("device_hash", device_hash).gte("timestamp", one_hour_ago).execute()
        res_ip = sb.table("onboarding_attempts").select("id", count="exact").eq("ip_address", ip_address).gte("timestamp", one_hour_ago).execute()
        
        count_device = res_device.count if res_device.count is not None else len(res_device.data)
        count_ip = res_ip.count if res_ip.count is not None else len(res_ip.data)
        
        return max(count_device, count_ip)
    except Exception as e:
        logger.warning(f"Velocity check failed: {e}")
        return 0

def evaluate_onboarding_risk(
    name: str,
    email: str,
    phone: str,
    dob: str,
    id_number: str,
    ip_address: str,
    device_signals: dict,
    behavior_signals: dict,
) -> dict:
    """
    Score the onboarding attempt from 0 (High Risk) to 100 (Trusted).
    
    Returns
    -------
    dict with keys: risk_score, decision, reason_codes
    """
    score = 100
    reason_codes: list[str] = []

    # 1. Document / Data Consistency
    email_domain = email.split("@")[-1].lower() if "@" in email else ""
    if email_domain in DISPOSABLE_DOMAINS:
        score -= 40
        reason_codes.append("DISPOSABLE_EMAIL")
    
    # Synthetic ID signals (mock: sequential numbers or repeating digits)
    if re.match(r"^(12345|98765|1111|0000)", id_number):
        score -= 50
        reason_codes.append("SYNTHETIC_IDENTITY_SIGNAL")

    # Mismatched name/DOB pattern mock (e.g. if name contains "Test")
    if "test" in name.lower() or "demo" in name.lower():
        score -= 30
        reason_codes.append("SUSPICIOUS_NAME_PATTERN")

    # 2. Velocity Abuse
    user_agent = device_signals.get("user_agent", "")
    timezone_str = device_signals.get("timezone", "")
    screen_res = device_signals.get("screen_res", "")
    language = device_signals.get("language", "")
    platform = device_signals.get("platform", "")
    
    device_hash = generate_fingerprint_hash(
        user_agent, timezone_str, screen_res, language, platform
    )
    
    velocity = _check_velocity(device_hash, ip_address)
    if velocity >= 3:
        score -= 60
        reason_codes.append("HIGH_VELOCITY_ABUSE")
    elif velocity == 2:
        score -= 20
        reason_codes.append("ELEVATED_VELOCITY")

    # 3. Behavioral Bot Signals
    typing_speed = behavior_signals.get("typing_speed_wpm", 0.0)
    mouse_event_count = behavior_signals.get("mouse_event_count", 0)
    key_hold_times = behavior_signals.get("key_hold_times", [])
    
    if typing_speed > 150:
        score -= 30
        reason_codes.append("BOT_SPEED_TYPING")
    elif typing_speed == 0.0 and len(key_hold_times) == 0:
        score -= 30
        reason_codes.append("PASTE_ONLY_INPUT")
        
    if mouse_event_count == 0:
        score -= 20
        reason_codes.append("NO_MOUSE_MOVEMENT")

    # Clamp score
    score = max(0, min(100, int(score)))

    # Determine decision
    if score >= 80:
        decision = "ALLOW"
    elif score >= 50:
        decision = "MANUAL_REVIEW"
    else:
        decision = "REJECT"

    return {
        "risk_score": score,
        "decision": decision,
        "reason_codes": reason_codes,
        "device_hash": device_hash
    }

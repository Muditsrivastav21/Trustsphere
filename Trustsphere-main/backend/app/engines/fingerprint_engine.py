"""
TrustSphere AI — Device Fingerprint Engine
Evaluates device trust by comparing the fingerprint hash against
known devices for the user, and checking for suspicious signals.
"""

from __future__ import annotations
from app.database.supabase_client import get_supabase
from app.utils.hashing import generate_fingerprint_hash
from app.utils.logger import logger
from functools import lru_cache


def _is_headless_browser(user_agent: str) -> bool:
    """Detect common headless browser signatures."""
    ua_lower = user_agent.lower()
    headless_markers = [
        "headlesschrome", "phantomjs", "slimerjs",
        "puppeteer", "playwright", "selenium",
    ]
    return any(marker in ua_lower for marker in headless_markers)


def _is_mobile_ua(user_agent: str) -> bool:
    """Check if the user-agent indicates a mobile device."""
    mobile_markers = ["mobile", "android", "iphone", "ipad"]
    ua_lower = user_agent.lower()
    return any(marker in ua_lower for marker in mobile_markers)

@lru_cache(maxsize=1000)
def _check_known_device_db(user_id: str, fingerprint_hash: str) -> dict | None:
    """Check Supabase for known device and cache the result in memory."""
    try:
        sb = get_supabase()
        result = (
            sb.table("device_fingerprints")
            .select("id, login_count, trust_level")
            .eq("user_id", user_id)
            .eq("fingerprint_hash", fingerprint_hash)
            .execute()
        )
        if result.data and len(result.data) > 0:
            return result.data[0]
        return None
    except Exception as e:
        logger.warning(f"Device lookup failed: {e}")
        return None


def evaluate_device(
    user_id: str,
    device_signals: dict,
) -> dict:
    """
    Score the device from 0–100 and return flags.

    Parameters
    ----------
    user_id : str
        UUID of the user from the users table.
    device_signals : dict
        Keys: user_agent, timezone, screen_res, language, platform,
              color_depth, touch_points.

    Returns
    -------
    dict with keys: device_score, is_known_device, fingerprint_hash, flags
    """
    user_agent = device_signals.get("user_agent", "")
    timezone = device_signals.get("timezone", "")
    screen_res = device_signals.get("screen_res", "")
    language = device_signals.get("language", "")
    platform = device_signals.get("platform", "")
    touch_points = device_signals.get("touch_points", 0)

    fingerprint_hash = generate_fingerprint_hash(
        user_agent, timezone, screen_res, language, platform
    )

    score = 100
    flags: list[str] = []

    # --- Check if device is known for this user ---
    is_known_device = False
    device_record = _check_known_device_db(user_id, fingerprint_hash)
    
    if device_record:
        is_known_device = True
        # Trusted devices with many logins get a small bonus
        if device_record.get("trust_level") == "TRUSTED":
            score += 5  # will be clamped later
    else:
        is_known_device = False

    # --- Scoring rules ---
    if not is_known_device:
        score -= 35
        flags.append("NEW_DEVICE")

    if timezone != "Asia/Kolkata":
        score -= 20
        flags.append("UNEXPECTED_TIMEZONE")

    if _is_headless_browser(user_agent):
        score -= 40
        flags.append("HEADLESS_BROWSER")

    if touch_points == 0 and _is_mobile_ua(user_agent):
        score -= 15
        flags.append("TOUCH_MISMATCH")

    # Clamp
    score = max(0, min(100, score))

    return {
        "device_score": score,
        "is_known_device": is_known_device,
        "fingerprint_hash": fingerprint_hash,
        "flags": flags,
    }

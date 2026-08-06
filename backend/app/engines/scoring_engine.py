"""
TrustSphere AI — Scoring Engine
Fetches weights from the system_config table and computes
the final weighted trust score from component sub-scores.
"""

from __future__ import annotations
from app.database.supabase_client import get_supabase
from app.utils.logger import logger


def _get_weights() -> dict[str, float]:
    """Load scoring weights from the system_config table."""
    defaults = {"device": 0.45, "behavior": 0.35, "network": 0.20}
    try:
        sb = get_supabase()
        result = (
            sb.table("system_config")
            .select("key, value")
            .in_("key", ["weight_device", "weight_behavior", "weight_network"])
            .execute()
        )
        for row in result.data:
            key = row["key"]
            val = float(row["value"])
            if key == "weight_device":
                defaults["device"] = val
            elif key == "weight_behavior":
                defaults["behavior"] = val
            elif key == "weight_network":
                defaults["network"] = val
    except Exception as e:
        logger.warning(f"Failed to load weights from system_config, using defaults: {e}")
    return defaults


def _get_thresholds() -> dict[str, int]:
    """Load risk thresholds from the system_config table."""
    defaults = {"allow": 85, "otp": 60, "block": 45}
    try:
        sb = get_supabase()
        result = (
            sb.table("system_config")
            .select("key, value")
            .in_("key", ["threshold_allow", "threshold_otp", "threshold_block"])
            .execute()
        )
        for row in result.data:
            key = row["key"]
            val = int(row["value"])
            if key == "threshold_allow":
                defaults["allow"] = val
            elif key == "threshold_otp":
                defaults["otp"] = val
            elif key == "threshold_block":
                defaults["block"] = val
    except Exception as e:
        logger.warning(f"Failed to load thresholds from system_config, using defaults: {e}")
    return defaults


def calculate_trust_score(
    device_score: int,
    behavior_score: int,
    network_score: int,
) -> dict:
    """
    Compute the weighted trust score and determine risk level + auth action.

    Returns
    -------
    dict with keys: trust_score, risk_level, auth_action
    """
    weights = _get_weights()
    thresholds = _get_thresholds()

    raw = (
        device_score * weights["device"]
        + behavior_score * weights["behavior"]
        + network_score * weights["network"]
    )
    trust_score = max(0, min(100, int(round(raw))))

    # Determine risk level and auth action
    if trust_score >= thresholds["allow"]:
        risk_level = "LOW"
        auth_action = "ALLOW"
    elif trust_score >= thresholds["otp"]:
        risk_level = "MEDIUM"
        auth_action = "OTP"
    elif trust_score >= thresholds["block"]:
        risk_level = "HIGH"
        auth_action = "OTP"
    else:
        risk_level = "CRITICAL"
        auth_action = "BLOCK"

    return {
        "trust_score": trust_score,
        "risk_level": risk_level,
        "auth_action": auth_action,
    }

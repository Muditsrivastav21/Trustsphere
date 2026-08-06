"""
TrustSphere AI — Privileged Access Management Engine (PrivGuard)
Evaluates analyst/admin actions for anomalous behavior.
"""

from __future__ import annotations
from datetime import datetime, timedelta, timezone
from app.database.supabase_client import get_supabase
from app.utils.logger import logger

def _check_off_hours(timestamp: datetime) -> bool:
    """Flag access outside normal business hours (8 AM - 8 PM)."""
    # Using UTC hour for the prototype
    hour = timestamp.hour
    return hour < 8 or hour > 20

def _get_velocity_anomaly(actor_id: str, event_type: str, timestamp: datetime) -> tuple[bool, float]:
    """
    Check if the volume of sensitive queries in the last 15 minutes
    exceeds a statistical baseline.
    """
    if not actor_id:
        return False, 0.0

    try:
        sb = get_supabase()
        fifteen_mins_ago = (timestamp - timedelta(minutes=15)).isoformat()
        
        # Fetch recent actions from audit_log
        # Since actor_id might be in metadata, we can use JSON filtering in Supabase
        # .eq("metadata->>actor_id", actor_id)
        res_recent = sb.table("audit_log") \
            .select("id", count="exact") \
            .eq("event_type", event_type) \
            .eq("metadata->>actor_id", actor_id) \
            .gte("created_at", fifteen_mins_ago) \
            .execute()
        
        recent_count = res_recent.count if res_recent.count is not None else len(res_recent.data)

        # Baseline thresholds
        if event_type == "CONFIG_UPDATED" and recent_count >= 2:
             return True, float(recent_count)
        
        if event_type == "TRUST_OVERRIDE" and recent_count >= 5:
             return True, float(recent_count)
             
        if event_type == "SENSITIVE_DATA_ACCESS" and recent_count >= 20:
             return True, float(recent_count)

        return False, float(recent_count)

    except Exception as e:
        logger.warning(f"Velocity anomaly check failed: {e}")
        return False, 0.0

def evaluate_privileged_access(
    actor_id: str | None,
    event_type: str,
    action_details: dict
) -> dict:
    """
    Score the privileged action from 0 (Normal) to 100 (Highly Anomalous).
    
    Returns
    -------
    dict with keys: anomaly_score, decision, reason_codes
    """
    score = 0
    reason_codes: list[str] = []
    
    now = datetime.now(timezone.utc)

    # 1. Off-hours
    if _check_off_hours(now):
        score += 30
        reason_codes.append("OFF_HOURS_ACCESS")

    # 2. Velocity / Volume anomaly
    is_anomalous_velocity, count = _get_velocity_anomaly(actor_id, event_type, now)
    if is_anomalous_velocity:
        score += 50
        reason_codes.append("HIGH_VOLUME_ANOMALY")
        
    # 3. Contextual Risk
    if event_type == "CONFIG_UPDATED":
        score += 10 # Inherently sensitive action

    score = max(0, min(100, int(score)))

    # Determine decision
    if score >= 70:
        decision = "BLOCK"
    elif score >= 30:
        decision = "FLAG"
    else:
        decision = "ALLOW"

    return {
        "anomaly_score": score,
        "decision": decision,
        "reason_codes": reason_codes
    }

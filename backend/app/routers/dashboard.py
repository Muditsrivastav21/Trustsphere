"""
TrustSphere AI — Dashboard Router
GET /api/stats/overview           — aggregate dashboard stats
GET /api/stats/risk-distribution  — risk level counts
"""

from __future__ import annotations

import math
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.database.supabase_client import get_supabase
from app.models.responses import OverviewResponse, DeltaStats, RiskDistributionResponse
from app.utils.logger import logger
from app.services.session_service import get_user_by_auth_id

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
    
    return user

router = APIRouter()


@router.get("/overview", response_model=OverviewResponse)
def stats_overview(current_user: dict = Depends(get_current_user)):
    """Aggregate counts from login_events for the last 24 hours."""
    sb = get_supabase()

    try:
        query = sb.table("login_events").select("trust_score, risk_level, auth_action, timestamp")
        if current_user.get("role") == "customer":
            query = query.eq("user_id", current_user["id"])
            
        all_events = query.execute()
        rows = all_events.data or []

        total = len(rows)
        high_risk = sum(1 for r in rows if r.get("risk_level") in ("HIGH", "CRITICAL"))
        blocked = sum(1 for r in rows if r.get("auth_action") == "BLOCK")
        otp_triggered = sum(1 for r in rows if r.get("auth_action") == "OTP")
        scores = [r.get("trust_score", 0) for r in rows]
        avg_score = round(sum(scores) / len(scores), 1) if scores else 0.0

        # Fraud rings from graph_nodes
        try:
            fraud_rings = sb.table("graph_nodes").select("id").eq("node_type", "FRAUD_RING").execute()
            fraud_count = len(fraud_rings.data) if fraud_rings.data else 0
        except Exception:
            fraud_count = 0

        # Delta stats (approximate — last N entries as "last hour")
        recent = rows[-20:] if len(rows) >= 20 else rows
        delta_total = len(recent)
        delta_high = sum(1 for r in recent if r.get("risk_level") in ("HIGH", "CRITICAL"))

        try:
            onboarding_req = sb.table("onboarding_attempts").select("id, decision").neq("decision", "APPROVE").execute()
            flagged_onboarding = len(onboarding_req.data) if onboarding_req.data else 0
            
            recovery_req = sb.table("recovery_attempts").select("id, decision").neq("decision", "ALLOW").execute()
            flagged_recovery = len(recovery_req.data) if recovery_req.data else 0
            
            insider_req = sb.table("audit_logs").select("id, event_type").eq("event_type", "INSIDER_THREAT_ALERT").execute()
            insider_alerts = len(insider_req.data) if insider_req.data else 0
        except Exception as ex:
            logger.warning(f"Failed to fetch new module stats: {ex}")
            flagged_onboarding = 0
            flagged_recovery = 0
            insider_alerts = 0

    except Exception as e:
        logger.error(f"Stats overview query failed: {e}")
        return OverviewResponse()

    return OverviewResponse(
        total_logins_today=total,
        high_risk_count=high_risk,
        blocked_count=blocked,
        fraud_rings_detected=fraud_count,
        avg_trust_score=avg_score,
        otp_triggered_count=otp_triggered,
        delta=DeltaStats(
            total_logins_last_hour=delta_total,
            high_risk_last_hour=delta_high,
        ),
        flagged_onboarding_count=flagged_onboarding,
        flagged_recovery_count=flagged_recovery,
        insider_alerts_count=insider_alerts,
    )


@router.get("/risk-distribution", response_model=RiskDistributionResponse)
def risk_distribution(current_user: dict = Depends(get_current_user)):
    """Group login events by risk level."""
    sb = get_supabase()

    try:
        query = sb.table("login_events").select("risk_level")
        if current_user.get("role") == "customer":
            query = query.eq("user_id", current_user["id"])
            
        result = query.execute()
        rows = result.data or []

        counts = {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "CRITICAL": 0}
        for r in rows:
            level = r.get("risk_level", "LOW")
            if level in counts:
                counts[level] += 1

    except Exception as e:
        logger.error(f"Risk distribution query failed: {e}")
        return RiskDistributionResponse()

    return RiskDistributionResponse(
        low=counts["LOW"],
        medium=counts["MEDIUM"],
        high=counts["HIGH"],
        critical=counts["CRITICAL"],
    )

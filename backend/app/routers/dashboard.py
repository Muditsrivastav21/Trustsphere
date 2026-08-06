"""
TrustSphere AI — Dashboard Router
GET /api/stats/overview           — aggregate dashboard stats
GET /api/stats/risk-distribution  — risk level counts
"""

from datetime import datetime, timezone
import math
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.database.supabase_client import get_supabase
from app.models.requests import ReviewFreezeRequest
from app.models.responses import OverviewResponse, DeltaStats, RiskDistributionResponse
from app.utils.logger import logger
from app.services.session_service import get_user_by_auth_id, is_token_stale

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

        # Fraud rings from graph graph_service (Neo4j / Mock)
        try:
            from app.services.graph_service import read_graph_nodes
            graph_data = read_graph_nodes(filter_type="fraud_only")
            fraud_count = sum(1 for n in graph_data.get("nodes", []) if n.get("type") == "FRAUD_RING")
            if fraud_count == 0:
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
            
            # Recovery attempts aren't a separate table — they're written into
            # login_events with auth_action="RECOVERY_{decision}" (see recovery.py).
            recovery_req = (
                sb.table("login_events")
                .select("id, auth_action")
                .like("auth_action", "RECOVERY_%")
                .neq("auth_action", "RECOVERY_ALLOW")
                .execute()
            )
            flagged_recovery = len(recovery_req.data) if recovery_req.data else 0
            
            insider_req = sb.table("audit_log").select("id, event_type").eq("event_type", "INSIDER_THREAT_FLAGGED").execute()
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


@router.get("/users")
def get_users_list(current_user: dict = Depends(get_current_user)):
    """Fetch real users from the database with aggregate trust stats."""
    if current_user.get("role") not in ("analyst", "admin"):
        raise HTTPException(status_code=403, detail="Permission denied")
        
    sb = get_supabase()
    try:
        try:
            users_res = sb.table("users").select(
                "id, name, customer_id, account_type, email, role, risk_profile, freeze_status, freeze_reason, freeze_requested_at, freeze_reviewed_at, freeze_review_notes, freeze_reviewed_by"
            ).execute()
        except Exception:
            users_res = sb.table("users").select("id, name, customer_id, account_type, email, role, risk_profile").execute()
            
        users_data = users_res.data or []
        
        # Enrich freeze details from audit log if extra columns are not present
        user_freeze_info = {}
        try:
            audit_res = sb.table("audit_log").select("event_type, metadata, created_at").in_("event_type", ["ACCOUNT_FREEZE_REQUESTED", "ACCOUNT_UNFROZEN_APPROVED", "ACCOUNT_UNFREEZE_REJECTED"]).execute()
            audit_entries = audit_res.data or []
            for log in audit_entries:
                meta = log.get("metadata") or {}
                uid = meta.get("user_id") or meta.get("target_user_id")
                if uid and uid not in user_freeze_info:
                    et = log.get("event_type", "")
                    user_freeze_info[uid] = {
                        "freeze_reason": meta.get("reason", ""),
                        "freeze_status": meta.get("freeze_status") or ("PENDING_REVIEW" if et == "ACCOUNT_FREEZE_REQUESTED" else "ACTIVE"),
                        "freeze_requested_at": meta.get("timestamp") or log.get("created_at"),
                        "freeze_reviewed_at": meta.get("timestamp") if ("APPROVED" in et or "REJECTED" in et) else "",
                        "freeze_review_notes": meta.get("review_notes", ""),
                        "freeze_reviewed_by": meta.get("analyst", ""),
                    }
        except Exception as ae:
            logger.warning(f"Could not read audit_log for freeze enrichment: {ae}")

        # Fetch all login events to compute aggregates
        events_res = sb.table("login_events").select("user_id, trust_score, device_hash, flags, metadata, timestamp").execute()
        events_data = events_res.data or []
        
        user_events = {}
        for event in events_data:
            uid = event.get("user_id")
            if uid not in user_events:
                user_events[uid] = []
            user_events[uid].append(event)
            
        result = []
        for u in users_data:
            uid = u["id"]
            u_evs = user_events.get(uid, [])
            f_info = user_freeze_info.get(uid, {})
            
            sessions_count = len(u_evs)
            avg_trust = round(sum(e["trust_score"] for e in u_evs) / sessions_count) if sessions_count > 0 else 100
            unique_devices = len(set(e.get("device_hash") for e in u_evs if e.get("device_hash")))
            if unique_devices == 0:
                unique_devices = 1
                
            # Get latest flags & xai_explanations
            latest_flags = []
            xai_explanations = []
            if sessions_count > 0:
                sorted_evs = sorted(u_evs, key=lambda x: x.get("timestamp", ""), reverse=True)
                latest_ev = sorted_evs[0]
                latest_flags = latest_ev.get("flags") or []
                metadata = latest_ev.get("metadata") or {}
                xai_explanations = metadata.get("xai_explanations") or []
                
            result.append({
                "db_id": u["id"],
                "name": u["name"],
                "id": u["customer_id"],
                "trust": avg_trust,
                "type": u.get("account_type") or "Savings",
                "sessions": sessions_count,
                "devices": unique_devices,
                "email": u.get("email") or "",
                "role": u.get("role") or "customer",
                "risk_profile": u.get("risk_profile") or "NORMAL",
                "freeze_status": u.get("freeze_status") or f_info.get("freeze_status") or ("PENDING_REVIEW" if u.get("risk_profile") == "FROZEN" else "ACTIVE"),
                "freeze_reason": u.get("freeze_reason") or f_info.get("freeze_reason") or "",
                "freeze_requested_at": u.get("freeze_requested_at") or f_info.get("freeze_requested_at") or "",
                "freeze_reviewed_at": u.get("freeze_reviewed_at") or f_info.get("freeze_reviewed_at") or "",
                "freeze_review_notes": u.get("freeze_review_notes") or f_info.get("freeze_review_notes") or "",
                "freeze_reviewed_by": u.get("freeze_reviewed_by") or f_info.get("freeze_reviewed_by") or "",
                "latest_flags": latest_flags,
                "xai_explanations": xai_explanations
            })
            
        return result
    except Exception as e:
        logger.error(f"Failed to fetch users list: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/freeze-requests")
def get_freeze_requests(current_user: dict = Depends(get_current_user)):
    """Fetch freeze requests for analyst review."""
    if current_user.get("role") not in ("analyst", "admin"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    sb = get_supabase()
    try:
        try:
            res = sb.table("users").select(
                "id, name, customer_id, email, role, risk_profile, freeze_status, freeze_reason, freeze_requested_at, freeze_reviewed_at, freeze_review_notes, freeze_reviewed_by"
            ).or_("risk_profile.eq.FROZEN,freeze_status.eq.PENDING_REVIEW").execute()
            users_data = res.data or []
        except Exception:
            res = sb.table("users").select("id, name, customer_id, email, role, risk_profile").eq("risk_profile", "FROZEN").execute()
            users_data = res.data or []
        
        user_audit_map = {}
        try:
            audit_res = sb.table("audit_log").select("event_type, metadata, created_at").eq("event_type", "ACCOUNT_FREEZE_REQUESTED").execute()
            for log in (audit_res.data or []):
                meta = log.get("metadata") or {}
                uid = meta.get("user_id")
                if uid:
                    user_audit_map[uid] = meta
        except Exception as ae:
            logger.warning(f"Could not read audit_log for freeze requests: {ae}")
                
        result = []
        for u in users_data:
            uid = u["id"]
            meta = user_audit_map.get(uid, {})
            result.append({
                "id": u["id"],
                "name": u["name"],
                "customer_id": u["customer_id"],
                "email": u.get("email") or "",
                "role": u.get("role") or "customer",
                "risk_profile": u.get("risk_profile") or "FROZEN",
                "freeze_status": u.get("freeze_status") or meta.get("freeze_status") or "PENDING_REVIEW",
                "freeze_reason": u.get("freeze_reason") or meta.get("reason") or "Emergency lock requested by user",
                "freeze_requested_at": u.get("freeze_requested_at") or meta.get("timestamp") or "",
                "freeze_reviewed_at": u.get("freeze_reviewed_at") or "",
                "freeze_review_notes": u.get("freeze_review_notes") or "",
                "freeze_reviewed_by": u.get("freeze_reviewed_by") or "",
            })
            
        return result
    except Exception as e:
        logger.error(f"Failed to fetch freeze requests: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/freeze-requests/{user_id}/review")
def review_freeze_request(user_id: str, req: ReviewFreezeRequest, current_user: dict = Depends(get_current_user)):
    """Analyst action to approve (reactivate) or reject an account unfreeze request."""
    if current_user.get("role") not in ("analyst", "admin"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    sb = get_supabase()
    now_str = datetime.now(timezone.utc).isoformat()
    analyst_email = current_user.get("email") or "analyst@trustsphere.com"
    
    user_res = sb.table("users").select("id, customer_id, name, email").or_(f"id.eq.{user_id},customer_id.eq.{user_id}").limit(1).execute()
    if not user_res.data:
        raise HTTPException(status_code=404, detail="User not found")
    
    target_user = user_res.data[0]
    target_db_id = target_user["id"]
    
    if req.action == "APPROVE":
        update_data = {
            "risk_profile": "NORMAL",
            "freeze_status": "ACTIVE",
            "freeze_reviewed_at": now_str,
            "freeze_review_notes": req.review_notes or "",
            "freeze_reviewed_by": analyst_email,
        }
        event_type = "ACCOUNT_UNFROZEN_APPROVED"
        msg = "Account reactivated successfully."
    else:
        update_data = {
            "risk_profile": "FROZEN",
            "freeze_status": "REJECTED",
            "freeze_reviewed_at": now_str,
            "freeze_review_notes": req.review_notes or "",
            "freeze_reviewed_by": analyst_email,
        }
        event_type = "ACCOUNT_UNFREEZE_REJECTED"
        msg = "Freeze request rejected. Account remains frozen."
        
    try:
        sb.table("users").update(update_data).eq("id", target_db_id).execute()
    except Exception as e:
        logger.warning(f"Could not update extended freeze review columns, updating risk_profile: {e}")
        new_risk = "NORMAL" if req.action == "APPROVE" else "FROZEN"
        sb.table("users").update({"risk_profile": new_risk}).eq("id", target_db_id).execute()
    
    from app.services.session_service import create_audit_log
    create_audit_log(
        event_type=event_type,
        description=f"Analyst {analyst_email} reviewed freeze request for {target_user.get('customer_id')} ({req.action}): {req.review_notes}",
        metadata={
            "analyst": analyst_email,
            "target_user_id": target_db_id,
            "customer_id": target_user.get("customer_id"),
            "action": req.action,
            "review_notes": req.review_notes,
            "freeze_status": update_data["freeze_status"],
            "timestamp": now_str,
        }
    )
    
    return {"status": "success", "message": msg, "user_id": target_db_id}


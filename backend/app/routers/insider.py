"""
TrustSphere AI — Insider Threat Router
GET /api/insider/anomalies
"""

from __future__ import annotations
import math
from fastapi import APIRouter, Query, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.database.supabase_client import get_supabase
from app.services.session_service import get_user_by_auth_id, is_token_stale
from app.utils.logger import logger

router = APIRouter()
security = HTTPBearer()

def get_admin_user(creds: HTTPAuthorizationCredentials = Depends(security)):
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

    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")
    
    return user


@router.get("/anomalies")
def get_anomalies(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_admin_user)
):
    """Paginated list of privileged access anomalies."""
    sb = get_supabase()

    try:
        offset = (page - 1) * limit
        result = (
            sb.table("audit_log")
            .select("id, event_type, description, metadata, created_at", count="exact")
            .eq("event_type", "INSIDER_THREAT_FLAGGED")
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        rows = result.data or []
        total = result.count or len(rows)
    except Exception as e:
        logger.error(f"Anomalies query failed: {e}")
        return {"anomalies": [], "total": 0, "page": page, "limit": limit, "pages": 0}

    pages = math.ceil(total / limit) if total > 0 else 0

    return {
        "anomalies": rows,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": pages,
    }

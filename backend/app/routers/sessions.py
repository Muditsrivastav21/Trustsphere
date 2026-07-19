"""
TrustSphere AI — Sessions Router
GET /api/sessions                 — paginated, filterable session list
GET /api/sessions/{session_id}    — single session detail
"""

from __future__ import annotations

import math
from fastapi import APIRouter, Query, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from app.database.supabase_client import get_supabase
from app.models.responses import SessionRow, SessionsListResponse
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


@router.get("", response_model=SessionsListResponse)
def list_sessions(
    current_user: dict = Depends(get_current_user),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    risk_level: Optional[str] = Query(None),
    auth_action: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    """Paginated list of login events with optional filters."""
    sb = get_supabase()

    try:
        query = sb.table("login_events").select(
            "session_id, user_name, customer_id, timestamp, ip_address, "
            "city, country, trust_score, risk_level, auth_action, "
            "is_known_device, flags",
            count="exact",
        )

        # RBAC: Customers only see their own data
        if current_user.get("role") == "customer":
            query = query.eq("user_id", current_user["id"])

        if risk_level:
            query = query.eq("risk_level", risk_level.upper())

        if auth_action:
            if auth_action.endswith("_"):
                query = query.like("auth_action", f"{auth_action.upper()}%")
            else:
                query = query.eq("auth_action", auth_action.upper())

        if search:
            query = query.or_(
                f"customer_id.ilike.%{search}%,"
                f"user_name.ilike.%{search}%,"
                f"session_id.ilike.%{search}%,"
                f"ip_address.ilike.%{search}%"
            )

        if date_from:
            query = query.gte("timestamp", date_from)
        if date_to:
            query = query.lte("timestamp", date_to)

        # Order + paginate
        offset = (page - 1) * limit
        query = query.order("timestamp", desc=True).range(offset, offset + limit - 1)

        result = query.execute()
        rows = result.data or []
        total = result.count or len(rows)

    except Exception as e:
        logger.error(f"Sessions query failed: {e}")
        return SessionsListResponse(sessions=[], total=0, page=page, limit=limit, pages=0)

    sessions = []
    for r in rows:
        city = r.get("city", "")
        country = r.get("country", "")
        location_str = f"{city}, {country}" if city and country else city or country or ""

        sessions.append(SessionRow(
            session_id=r.get("session_id", ""),
            user_name=r.get("user_name", ""),
            customer_id=r.get("customer_id", ""),
            timestamp=r.get("timestamp", ""),
            ip_address=r.get("ip_address", ""),
            location=location_str,
            trust_score=r.get("trust_score", 0),
            risk_level=r.get("risk_level", "LOW"),
            auth_action=r.get("auth_action", "ALLOW"),
            is_known_device=r.get("is_known_device", False),
            flags=r.get("flags") or [],
        ))

    pages = math.ceil(total / limit) if total > 0 else 0

    return SessionsListResponse(
        sessions=sessions,
        total=total,
        page=page,
        limit=limit,
        pages=pages,
    )


@router.get("/{session_id}")
def get_session_detail(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Fetch full detail for one session including behavioral metrics."""
    sb = get_supabase()

    query = sb.table("login_events").select("*").eq("session_id", session_id)
    
    # RBAC Data Isolation
    if current_user.get("role") == "customer":
        query = query.eq("user_id", current_user["id"])

    event = query.limit(1).execute()
    if not event.data:
        return {"detail": "Session not found or permission denied"}

    metrics = (
        sb.table("behavioral_metrics")
        .select("*")
        .eq("session_id", session_id)
        .limit(1)
        .execute()
    )

    return {
        "event": event.data[0],
        "metrics": metrics.data[0] if metrics.data else None,
    }

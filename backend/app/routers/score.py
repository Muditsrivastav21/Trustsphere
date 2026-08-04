"""
TrustSphere AI — Score Router
GET /api/score/{session_id} — retrieve a stored trust evaluation
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from app.models.responses import (
    LoginResponse, UserInfo, LocationInfo, ComponentScores,
)
from app.services.session_service import get_login_event_by_session, get_user_by_customer_id

router = APIRouter()


@router.get("/{session_id}", response_model=LoginResponse)
async def get_score(session_id: str):
    """Fetch a previously computed trust evaluation by session ID."""
    event = get_login_event_by_session(session_id)
    if not event:
        raise HTTPException(status_code=404, detail="Session not found")

    # Look up user details
    user = get_user_by_customer_id(event.get("customer_id", ""))
    user_info = UserInfo(
        name=event.get("user_name", "Unknown"),
        customer_id=event.get("customer_id", ""),
        city=user.get("city", "") if user else event.get("city", ""),
        account_type=user.get("account_type", "Savings") if user else "Savings",
    )

    return LoginResponse(
        session_id=session_id,
        user=user_info,
        trust_score=event.get("trust_score", 0),
        risk_level=event.get("risk_level", "LOW"),
        auth_action=event.get("auth_action", "ALLOW"),
        component_scores=ComponentScores(
            device=event.get("device_score", 0),
            behavior=event.get("behavior_score", 0),
            network=event.get("network_score", 0),
        ),
        flags=event.get("flags") or [],
        is_known_device=event.get("is_known_device", False),
        location=LocationInfo(
            country=event.get("country", ""),
            city=event.get("city", ""),
            ip=event.get("ip_address", ""),
        ),
        timestamp=event.get("timestamp", ""),
    )

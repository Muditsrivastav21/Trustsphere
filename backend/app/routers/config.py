"""
TrustSphere AI — Config Router
GET  /api/config/thresholds    — read scoring thresholds + weights
PUT  /api/config/thresholds    — update scoring thresholds + weights
GET  /api/config/audit-log     — paginated audit log
"""

from __future__ import annotations

import math
from fastapi import APIRouter, Query, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.database.supabase_client import get_supabase
from app.models.requests import ThresholdsUpdateRequest
from app.models.responses import (
    ThresholdsResponse, WeightsInfo,
    AuditLogResponse, AuditEntry,
)
from app.services.session_service import create_audit_log, get_user_by_auth_id, is_token_stale
from app.utils.logger import logger

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


@router.get("/thresholds", response_model=ThresholdsResponse)
def get_thresholds():
    """Read current scoring thresholds and weights from system_config."""
    sb = get_supabase()

    try:
        result = sb.table("system_config").select("key, value").execute()
        config: dict[str, str] = {}
        for row in result.data:
            config[row["key"]] = row["value"]
    except Exception as e:
        logger.error(f"Failed to read thresholds: {e}")
        return ThresholdsResponse()

    return ThresholdsResponse(
        threshold_allow=int(config.get("threshold_allow", "80")),
        threshold_otp=int(config.get("threshold_otp", "68")),
        threshold_block=int(config.get("threshold_block", "56")),
        weights=WeightsInfo(
            device=float(config.get("weight_device", "0.40")),
            behavior=float(config.get("weight_behavior", "0.35")),
            network=float(config.get("weight_network", "0.25")),
        ),
    )


@router.put("/thresholds", response_model=ThresholdsResponse)
def update_thresholds(
    req: ThresholdsUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Update scoring thresholds and/or weights in system_config."""
    sb = get_supabase()

    updates: dict[str, str] = {}
    if req.threshold_allow is not None:
        updates["threshold_allow"] = str(req.threshold_allow)
    if req.threshold_otp is not None:
        updates["threshold_otp"] = str(req.threshold_otp)
    if req.threshold_block is not None:
        updates["threshold_block"] = str(req.threshold_block)
    if req.weight_device is not None:
        updates["weight_device"] = str(req.weight_device)
    if req.weight_behavior is not None:
        updates["weight_behavior"] = str(req.weight_behavior)
    if req.weight_network is not None:
        updates["weight_network"] = str(req.weight_network)

    try:
        for key, value in updates.items():
            sb.table("system_config").update({"value": value}).eq("key", key).execute()

        create_audit_log(
            event_type="CONFIG_UPDATED",
            description=f"Scoring thresholds/weights updated: {updates}",
            metadata=updates,
            actor_id=current_user.get("id"),
        )
    except Exception as e:
        logger.error(f"Failed to update thresholds: {e}")

    # Return the refreshed config
    return get_thresholds()


@router.get("/audit-log", response_model=AuditLogResponse)
def get_audit_log(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """Paginated audit log entries."""
    sb = get_supabase()

    try:
        offset = (page - 1) * limit
        result = (
            sb.table("audit_log")
            .select("*", count="exact")
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        rows = result.data or []
        total = result.count or len(rows)
    except Exception as e:
        logger.error(f"Audit log query failed: {e}")
        return AuditLogResponse(entries=[], total=0, page=page, limit=limit, pages=0)

    entries = [
        AuditEntry(
            id=str(r.get("id", "")),
            event_type=r.get("event_type", ""),
            description=r.get("description"),
            metadata=r.get("metadata"),
            created_at=r.get("created_at", ""),
        )
        for r in rows
    ]

    pages = math.ceil(total / limit) if total > 0 else 0

    return AuditLogResponse(
        entries=entries,
        total=total,
        page=page,
        limit=limit,
        pages=pages,
    )

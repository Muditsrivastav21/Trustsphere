"""
TrustSphere AI — Config Router
GET  /api/config/thresholds    — read scoring thresholds + weights
PUT  /api/config/thresholds    — update scoring thresholds + weights
GET  /api/config/audit-log     — paginated audit log
"""

from __future__ import annotations

import math
from fastapi import APIRouter, Query, Depends
from app.database.supabase_client import get_supabase
from app.models.requests import ThresholdsUpdateRequest
from app.models.responses import (
    ThresholdsResponse, WeightsInfo,
    AuditLogResponse, AuditEntry,
)
from app.services.session_service import create_audit_log
from app.dependencies import require_admin, require_analyst_or_admin
from app.constants import (
    DEFAULT_WEIGHT_DEVICE, DEFAULT_WEIGHT_BEHAVIOR, DEFAULT_WEIGHT_NETWORK,
    DEFAULT_THRESHOLD_ALLOW, DEFAULT_THRESHOLD_OTP, DEFAULT_THRESHOLD_BLOCK,
)
from app.utils.logger import logger

router = APIRouter()


def _read_thresholds() -> ThresholdsResponse:
    """
    Shared logic for reading current thresholds — used by both the GET
    route and by PUT's "return the refreshed config" step. Split out so
    the PUT handler can call it as a plain function without going through
    FastAPI's dependency injection a second time (calling a route function
    directly would otherwise pass the raw `Depends(...)` marker as
    `current_user` instead of a real user dict).
    """
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
        threshold_allow=int(config.get("threshold_allow", str(DEFAULT_THRESHOLD_ALLOW))),
        threshold_otp=int(config.get("threshold_otp", str(DEFAULT_THRESHOLD_OTP))),
        threshold_block=int(config.get("threshold_block", str(DEFAULT_THRESHOLD_BLOCK))),
        weights=WeightsInfo(
            device=float(config.get("weight_device", str(DEFAULT_WEIGHT_DEVICE))),
            behavior=float(config.get("weight_behavior", str(DEFAULT_WEIGHT_BEHAVIOR))),
            network=float(config.get("weight_network", str(DEFAULT_WEIGHT_NETWORK))),
        ),
    )


@router.get("/thresholds", response_model=ThresholdsResponse)
def get_thresholds(current_user: dict = Depends(require_analyst_or_admin)):
    """
    Read current scoring thresholds and weights from system_config.
    Analyst/admin-only: this exposes the exact scoring logic, which would
    let anyone who can read it tune their behavior to sit just under the
    OTP/block thresholds. (Editing — see PUT below — is admin-only; this
    read path is analyst-or-admin to match the Settings UI, which already
    shows the Risk Thresholds tab to analysts.)
    """
    return _read_thresholds()


@router.put("/thresholds", response_model=ThresholdsResponse)
def update_thresholds(
    req: ThresholdsUpdateRequest,
    current_user: dict = Depends(require_admin)
):
    """
    Update scoring thresholds and/or weights in system_config.
    Admin-only — previously this accepted any authenticated user
    (including a plain customer), meaning any signed-in customer could
    silently retune the bank's fraud thresholds.
    """
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
    return _read_thresholds()


@router.get("/audit-log", response_model=AuditLogResponse)
def get_audit_log(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_analyst_or_admin),
):
    """
    Paginated audit log entries.
    Analyst/admin-only — this previously had no auth check at all, so
    anyone could read every privileged action (config changes, account
    freezes, insider flags) including actor IDs and session IDs.
    """
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

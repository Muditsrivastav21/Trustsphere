"""
TrustSphere AI — Insider Threat Router
GET /api/insider/anomalies
"""

from __future__ import annotations
import math
from fastapi import APIRouter, Query, Depends
from app.database.supabase_client import get_supabase
from app.dependencies import require_admin
from app.utils.logger import logger

router = APIRouter()


@router.get("/anomalies")
def get_anomalies(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_admin)
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

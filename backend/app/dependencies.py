"""
TrustSphere AI — Shared Auth Dependencies
Single source of truth for "who is calling this endpoint". Every router
previously carried its own copy-pasted `get_current_user` (auth.py,
sessions.py, dashboard.py, config.py, insider.py each had an identical
~15-line definition) — exactly the kind of duplication that silently
drifts out of sync (e.g. one copy gets the token-staleness check added,
another doesn't). This module is the one place that logic lives now.
"""

from __future__ import annotations
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.database.supabase_client import get_supabase
from app.services.session_service import get_user_by_auth_id, is_token_stale

security = HTTPBearer()


def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Resolve the Supabase Auth bearer token to a `users` table row."""
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
        raise HTTPException(
            status_code=401,
            detail="Session expired due to a recent password change. Please sign in again.",
        )

    return user


def require_analyst_or_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """
    Gate for endpoints that expose cross-user data — the fraud graph, the
    audit log, raw KYC onboarding attempts (which include unmasked
    Aadhaar/PAN numbers). A plain customer role must never reach these.
    """
    if current_user.get("role") not in ("analyst", "admin"):
        raise HTTPException(status_code=403, detail="Analyst or admin privileges required")
    return current_user


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """
    Gate for endpoints that read or change platform-wide configuration
    (scoring weights/thresholds). Anything less than admin here means any
    logged-in customer could quietly retune the bank's fraud thresholds.
    """
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return current_user

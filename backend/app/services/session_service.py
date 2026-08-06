"""
TrustSphere AI — Session Service
Orchestrates creating login events, behavioral metrics records,
device fingerprint upserts, and audit log entries in Supabase.
"""

from __future__ import annotations

import random
from datetime import datetime, timezone
from app.database.supabase_client import get_supabase
from app.utils.logger import logger


def create_login_event(data: dict) -> None:
    """
    INSERT a row into login_events.
    This triggers Supabase Realtime automatically.
    """
    sb = get_supabase()
    sb.table("login_events").insert(data).execute()
    logger.info(f"Login event created: {data.get('session_id')}")


def create_behavioral_metrics(data: dict) -> None:
    """INSERT a row into behavioral_metrics."""
    sb = get_supabase()
    sb.table("behavioral_metrics").insert(data).execute()


def upsert_device_fingerprint(user_id: str, fingerprint_hash: str, device: dict) -> None:
    """
    UPSERT into device_fingerprints.
    If the device is already known, update last_seen and increment login_count.
    """
    sb = get_supabase()
    now = datetime.now(timezone.utc).isoformat()

    # Check if exists
    existing = (
        sb.table("device_fingerprints")
        .select("id, login_count")
        .eq("user_id", user_id)
        .eq("fingerprint_hash", fingerprint_hash)
        .execute()
    )

    if existing.data and len(existing.data) > 0:
        row = existing.data[0]
        new_count = (row.get("login_count") or 0) + 1
        trust_level = "TRUSTED" if new_count >= 3 else "KNOWN"
        sb.table("device_fingerprints").update({
            "last_seen": now,
            "login_count": new_count,
            "trust_level": trust_level,
        }).eq("id", row["id"]).execute()
    else:
        sb.table("device_fingerprints").insert({
            "user_id": user_id,
            "fingerprint_hash": fingerprint_hash,
            "user_agent": device.get("user_agent", ""),
            "timezone": device.get("timezone", ""),
            "screen_res": device.get("screen_res", ""),
            "language": device.get("language", ""),
            "platform": device.get("platform", ""),
            "color_depth": device.get("color_depth", 24),
            "trust_level": "NEW",
            "first_seen": now,
            "last_seen": now,
            "login_count": 1,
        }).execute()
        
    from app.engines.fingerprint_engine import invalidate_device_cache
    invalidate_device_cache(user_id, fingerprint_hash)

def update_user_home_region(user_id: str, home_country: str, home_timezone: str) -> None:
    """Sets the initial baseline home country and timezone for a user."""
    sb = get_supabase()
    sb.table("users").update({
        "home_country": home_country,
        "home_timezone": home_timezone
    }).eq("id", user_id).execute()


def create_audit_log(event_type: str, description: str, metadata: dict | None = None, actor_id: str | None = None) -> None:
    """INSERT an audit log entry."""
    sb = get_supabase()
    meta = metadata or {}
    if actor_id:
        meta["actor_id"] = actor_id
        
    sb.table("audit_log").insert({
        "event_type": event_type,
        "description": description,
        "metadata": meta,
    }).execute()

    # Evaluate PAM / Insider Threat Risk
    if actor_id and event_type != "INSIDER_THREAT_FLAGGED":
        from app.engines.privileged_access_engine import evaluate_privileged_access
        risk_result = evaluate_privileged_access(actor_id, event_type, meta)
        
        if risk_result["decision"] in ("FLAG", "BLOCK"):
            sb.table("audit_log").insert({
                "event_type": "INSIDER_THREAT_FLAGGED",
                "description": f"Anomalous analyst action detected ({risk_result['decision']})",
                "metadata": {
                    "actor_id": actor_id,
                    "original_event": event_type,
                    "anomaly_score": risk_result["anomaly_score"],
                    "reason_codes": risk_result["reason_codes"]
                },
            }).execute()


def get_login_event_by_session(session_id: str) -> dict | None:
    """Fetch a single login event by session_id."""
    sb = get_supabase()
    result = (
        sb.table("login_events")
        .select("*")
        .eq("session_id", session_id)
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0]
    return None


def get_user_by_customer_id(customer_id: str) -> dict | None:
    """Look up a user from the users table."""
    sb = get_supabase()
    result = (
        sb.table("users")
        .select("*")
        .eq("customer_id", customer_id)
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0]
    return None

def get_user_by_auth_id(auth_id: str) -> dict | None:
    """Look up a user by their Supabase auth_id."""
    sb = get_supabase()
    result = (
        sb.table("users")
        .select("*")
        .eq("auth_id", auth_id)
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0]
    return None


def get_or_create_user_profile(
    auth_id: str,
    email: str | None = None,
    user_metadata: dict | None = None,
) -> dict | None:
    """
    Look up a user by auth_id. If not found:
      1. Try to find by email and link auth_id to that existing record.
      2. If still not found, create a brand-new user profile.
    This ensures Google OAuth users always have a corresponding profile.
    """
    sb = get_supabase()

    # 1. Try by auth_id first
    user = get_user_by_auth_id(auth_id)
    if user:
        return user

    # 2. Try to find by email and link auth_id
    if email:
        email_result = (
            sb.table("users")
            .select("*")
            .eq("email", email)
            .limit(1)
            .execute()
        )
        if email_result.data:
            existing = email_result.data[0]
            # Link auth_id so future lookups succeed directly
            sb.table("users").update({"auth_id": auth_id}).eq("id", existing["id"]).execute()
            logger.info(f"Linked auth_id to existing user: {existing['customer_id']}")
            existing["auth_id"] = auth_id
            return existing

    # 3. Create a new profile
    meta = user_metadata or {}
    full_name = (
        meta.get("full_name")
        or meta.get("name")
        or (email.split("@")[0].replace(".", " ").title() if email else "New User")
    )
    customer_id = f"CUST{random.randint(100000, 999999)}"

    new_user = {
        "auth_id": auth_id,
        "customer_id": customer_id,
        "name": full_name,
        "email": email or "",
        "account_type": "Savings",
        "risk_profile": "NORMAL",
        "role": "customer",
    }
    insert_result = sb.table("users").insert(new_user).execute()
    if insert_result.data:
        logger.info(f"Auto-created user profile for Google OAuth: {customer_id}")
        return insert_result.data[0]

    logger.error(f"Failed to auto-create user profile for auth_id={auth_id}")
    return None

def evaluate_mid_session_hijack(
    session_id: str,
    current_ip: str | None,
    current_device_dict: dict | None,
    current_behavior_score: int
) -> list[str]:
    """
    Compare current signals against the original login event to detect hijacking.
    Returns a list of flags (empty if no hijack detected).
    """
    flags = []
    
    # 1. Fetch original session
    login_event = get_login_event_by_session(session_id)
    if not login_event:
        return flags
        
    # 2. Check IP change
    original_ip = login_event.get("ip_address")
    if current_ip and original_ip and current_ip != original_ip:
        # Simplistic check: If IP changed materially during session
        flags.append("MID_SESSION_IP_CHANGE")
        
    # 3. Check Device change
    original_device_hash = login_event.get("device_hash")
    if current_device_dict and original_device_hash:
        from app.utils.hashing import generate_fingerprint_hash
        user_agent = current_device_dict.get("user_agent", "")
        timezone = current_device_dict.get("timezone", "")
        screen_res = current_device_dict.get("screen_res", "")
        language = current_device_dict.get("language", "")
        platform = current_device_dict.get("platform", "")
        current_hash = generate_fingerprint_hash(user_agent, timezone, screen_res, language, platform)
        if current_hash != original_device_hash:
            flags.append("MID_SESSION_DEVICE_CHANGE")
            
    # 4. Check Behavior drop
    original_behavior_score = login_event.get("behavior_score", 100)
    if current_behavior_score < 40 and original_behavior_score > 70:
        flags.append("MID_SESSION_BEHAVIOR_DROP")
        
    return flags

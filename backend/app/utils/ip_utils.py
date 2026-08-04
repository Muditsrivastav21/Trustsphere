"""
TrustSphere AI — IP Utilities
Checks the local flagged_ips table in Supabase and optionally
calls ipapi.co for geolocation data.
"""

from __future__ import annotations

import httpx
import math
from app.database.supabase_client import get_supabase
from app.utils.logger import logger


async def check_flagged_ip(ip_address: str) -> dict | None:
    """
    Look up the IP in the Supabase flagged_ips table.
    Returns the row dict if flagged, otherwise None.
    """
    try:
        sb = get_supabase()
        result = (
            sb.table("flagged_ips")
            .select("*")
            .eq("ip_address", ip_address)
            .execute()
        )
        if result.data:
            return result.data[0]
    except Exception as e:
        logger.warning(f"Error checking flagged IP {ip_address}: {e}")
    return None


async def geolocate_ip(ip_address: str) -> dict:
    """
    Call ipapi.co free API for geolocation.
    Falls back to defaults on failure or rate-limiting.
    """
    defaults = {"country": "IN", "city": "Unknown", "ip": ip_address, "latitude": 20.5937, "longitude": 78.9629}
    # Skip geolocation for private / loopback addresses
    if ip_address.startswith(("127.", "10.", "192.168.", "172.", "0.")):
        return {"country": "IN", "city": "Local", "ip": ip_address, "latitude": 20.5937, "longitude": 78.9629}

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"https://ipapi.co/{ip_address}/json/")
            if resp.status_code == 200:
                data = resp.json()
                if "error" not in data:
                    return {
                        "country": data.get("country_code", "IN"),
                        "city": data.get("city", "Unknown"),
                        "ip": ip_address,
                        "latitude": data.get("latitude", 20.5937),
                        "longitude": data.get("longitude", 78.9629),
                    }
    except Exception as e:
        logger.warning(f"IP geolocation failed for {ip_address}: {e}")

    return defaults


async def check_ip_history_for_user(ip_address: str, user_id: str) -> bool:
    """
    Return True if this IP has been seen before for this user
    in past login_events.
    """
    try:
        sb = get_supabase()
        result = (
            sb.table("login_events")
            .select("id")
            .eq("user_id", user_id)
            .eq("ip_address", ip_address)
            .limit(1)
            .execute()
        )
        return len(result.data) > 0
    except Exception as e:
        logger.warning(f"Error checking IP history: {e}")
        return False


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two points on Earth in km."""
    R = 6371.0 # Radius of earth in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


async def get_last_login_for_user(user_id: str) -> dict | None:
    """Fetch the most recent login event for the user."""
    if not user_id:
        return None
    try:
        sb = get_supabase()
        result = (
            sb.table("login_events")
            .select("ip_address, timestamp")
            .eq("user_id", user_id)
            .order("timestamp", desc=True)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]
    except Exception as e:
        logger.warning(f"Error fetching last login for {user_id}: {e}")
    return None

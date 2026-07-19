"""
TrustSphere AI — Network Reputation Engine
Evaluates the user's IP address for reputation signals:
flagged IPs, TOR exit nodes, geolocation anomalies, and IP history.
"""

from __future__ import annotations
from app.utils.ip_utils import check_flagged_ip, geolocate_ip, check_ip_history_for_user, get_last_login_for_user, haversine_distance
from app.utils.logger import logger

# Common TOR exit node IP prefixes (simplified check)
TOR_PREFIXES = ["185.220.", "198.98.", "62.102.", "45.33."]


async def evaluate_network(ip_address: str, user_id: str) -> dict:
    """
    Score the network signal from 0–100 and return flags + geolocation.

    Parameters
    ----------
    ip_address : str
    user_id : str   UUID of the user for history lookup.

    Returns
    -------
    dict with keys: network_score, flags, location (country, city, ip)
    """
    score = 100
    flags: list[str] = []

    # 1. Check the local flagged_ips table
    flagged = await check_flagged_ip(ip_address)
    if flagged:
        severity = flagged.get("severity", "HIGH")
        if severity == "CRITICAL":
            score -= 50
            flags.append("FLAGGED_IP_CRITICAL")
        else:
            score -= 35
            flags.append("FLAGGED_IP_HIGH")

    # 2. Check for TOR exit node patterns
    if any(ip_address.startswith(prefix) for prefix in TOR_PREFIXES):
        if "FLAGGED_IP_CRITICAL" not in flags and "FLAGGED_IP_HIGH" not in flags:
            score -= 40
        flags.append("TOR_EXIT_NODE")

    # 3. Check if IP has been seen before for this user
    ip_seen = await check_ip_history_for_user(ip_address, user_id)
    
    geo = await geolocate_ip(ip_address)
    country = geo.get("country", "IN")

    if not ip_seen:
        score -= 15
        flags.append("NEW_IP_FOR_USER")
        
        # --- Impossible Travel (Geo-Velocity) ---
        last_login = await get_last_login_for_user(user_id)
        if last_login and last_login.get("ip_address") != ip_address:
            last_ip = last_login["ip_address"]
            last_ts_str = last_login.get("timestamp")
            if last_ts_str:
                from datetime import datetime, timezone
                try:
                    # Clean Z from isoformat if present for python 3.10 compat
                    last_ts = datetime.fromisoformat(last_ts_str.replace('Z', '+00:00'))
                    now_ts = datetime.now(timezone.utc)
                    hours_diff = (now_ts - last_ts).total_seconds() / 3600.0
                    
                    if hours_diff > 0:
                        last_geo = await geolocate_ip(last_ip)
                        dist_km = haversine_distance(
                            last_geo.get("latitude", 20.5), last_geo.get("longitude", 78.9),
                            geo.get("latitude", 20.5), geo.get("longitude", 78.9)
                        )
                        
                        speed = dist_km / hours_diff
                        # Max commercial flight speed is ~1000 km/h, adding a minimum distance to avoid jitter
                        if speed > 1000 and dist_km > 100:
                            score -= 45
                            flags.append("IMPOSSIBLE_TRAVEL")
                            logger.info(f"Impossible travel detected: {speed:.1f} km/h over {dist_km:.1f} km")
                except Exception as e:
                    logger.warning(f"Impossible travel check failed: {e}")

    # 4. Geolocation check
    if country != "IN":
        score -= 30
        flags.append("FOREIGN_IP")

    score = max(0, min(100, score))

    return {
        "network_score": score,
        "flags": flags,
        "location": geo,
    }

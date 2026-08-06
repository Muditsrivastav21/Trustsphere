"""
Tests for the network reputation engine (app/engines/network_engine.py).
All IP-reputation/geolocation/history lookups are mocked at the module
boundary so these run instantly with no external network calls.
"""

import asyncio
from unittest.mock import patch, MagicMock

from app.engines.network_engine import evaluate_network

INDIA_GEO = {"country": "IN", "city": "Mumbai", "ip": "1.2.3.4", "latitude": 19.076, "longitude": 72.877}
US_GEO = {"country": "US", "city": "San Jose", "ip": "5.6.7.8", "latitude": 37.338, "longitude": -121.886}


def _run(ip_address="103.21.124.8", user_id="user-123",
          flagged=None, ip_seen=True, geo=INDIA_GEO, home_country="IN",
          last_login=None, last_login_geo=None):
    """
    flagged: None (not flagged) or {"severity": "HIGH"|"CRITICAL"}
    last_login: None or {"ip_address": ..., "timestamp": ...}
    last_login_geo: geo dict returned when geolocate_ip is called for the
        *previous* login's IP (defaults to `geo` itself, i.e. "same place"
        — only matters for the impossible-travel tests, which set it
        explicitly to a genuinely distant location).
    """
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"home_country": home_country}
    ]

    async def _flagged(_ip):
        return flagged

    async def _geo(ip):
        # geolocate_ip is called once for the current IP and, inside the
        # impossible-travel check, once more for the *previous* login's
        # IP — these must be able to resolve to genuinely different
        # locations for that check to mean anything.
        if last_login and ip == last_login.get("ip_address") and last_login_geo is not None:
            return last_login_geo
        return geo

    async def _history(_ip, _uid):
        return ip_seen

    async def _last_login(_uid):
        return last_login

    with patch("app.engines.network_engine.check_flagged_ip", side_effect=_flagged), \
         patch("app.engines.network_engine.geolocate_ip", side_effect=_geo), \
         patch("app.engines.network_engine.check_ip_history_for_user", side_effect=_history), \
         patch("app.engines.network_engine.get_last_login_for_user", side_effect=_last_login), \
         patch("app.database.supabase_client.get_supabase", return_value=mock_sb):
        return asyncio.run(evaluate_network(ip_address, user_id))


def test_known_ip_domestic_no_flags_is_full_trust():
    result = _run(ip_seen=True, geo=INDIA_GEO, home_country="IN")
    assert result["network_score"] == 100
    assert result["flags"] == []


def test_critical_flagged_ip_is_heavily_penalized():
    result = _run(flagged={"severity": "CRITICAL"})
    assert "FLAGGED_IP_CRITICAL" in result["flags"]
    assert result["network_score"] == 50  # 100 - 50


def test_high_flagged_ip_is_penalized():
    result = _run(flagged={"severity": "HIGH"})
    assert "FLAGGED_IP_HIGH" in result["flags"]
    assert result["network_score"] == 65  # 100 - 35


def test_tor_exit_node_prefix_is_detected():
    result = _run(ip_address="185.220.101.45")
    assert "TOR_EXIT_NODE" in result["flags"]
    assert result["network_score"] == 60  # 100 - 40


def test_tor_and_flagged_dont_double_penalize_the_same_severity_bucket():
    # A CRITICAL-flagged IP that also happens to be a TOR-prefix IP should
    # only take the CRITICAL penalty once, plus the TOR flag itself, not a
    # second full penalty on top — matches the `if "FLAGGED_IP_CRITICAL"
    # not in flags` guard in network_engine.py.
    result = _run(ip_address="185.220.101.45", flagged={"severity": "CRITICAL"})
    assert "FLAGGED_IP_CRITICAL" in result["flags"]
    assert "TOR_EXIT_NODE" in result["flags"]
    assert result["network_score"] == 50  # only the -50 CRITICAL penalty applied


def test_new_ip_for_user_is_flagged():
    result = _run(ip_seen=False)
    assert "NEW_IP_FOR_USER" in result["flags"]
    assert result["network_score"] == 85  # 100 - 15


def test_foreign_ip_relative_to_home_country_is_penalized():
    result = _run(geo=US_GEO, home_country="IN", ip_seen=True)
    assert "FOREIGN_IP" in result["flags"]
    assert result["network_score"] == 70  # 100 - 30


def test_impossible_travel_is_detected_for_implausible_speed():
    from datetime import datetime, timedelta, timezone
    # Mumbai -> San Jose (~13,000 km) in 10 minutes is impossible. The
    # current login's IP must differ from the last-seen IP, or the
    # impossible-travel branch (`last_login["ip_address"] != ip_address`)
    # never even runs.
    ten_minutes_ago = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    result = _run(
        ip_address="5.6.7.8",
        geo=US_GEO, ip_seen=False, home_country="US",
        last_login={"ip_address": "103.21.124.8", "timestamp": ten_minutes_ago},
        last_login_geo=INDIA_GEO,
    )
    assert "IMPOSSIBLE_TRAVEL" in result["flags"]
    assert result["network_score"] <= 55  # -15 (new IP) - 45 (impossible travel), clamped


def test_score_never_goes_below_zero():
    from datetime import datetime, timedelta, timezone
    ten_minutes_ago = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    result = _run(
        ip_address="185.220.101.45",
        flagged={"severity": "CRITICAL"},
        geo=US_GEO, ip_seen=False, home_country="IN",
        last_login={"ip_address": "103.21.124.8", "timestamp": ten_minutes_ago},
        last_login_geo=INDIA_GEO,
    )
    assert "IMPOSSIBLE_TRAVEL" in result["flags"]  # confirms every penalty really stacked
    assert result["network_score"] >= 0

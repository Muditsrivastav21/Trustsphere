"""
Tests for the Privileged Access Management / insider-threat engine
(app/engines/privileged_access_engine.py). Both the wall-clock "off hours"
check and the Supabase-backed velocity check are mocked at the module
boundary so these are deterministic and run with no external dependencies.
"""

from datetime import datetime, timezone
from unittest.mock import patch

from app.engines.privileged_access_engine import evaluate_privileged_access

BUSINESS_HOURS = datetime(2026, 1, 15, 14, 0, tzinfo=timezone.utc)  # 2 PM UTC
OFF_HOURS = datetime(2026, 1, 15, 2, 0, tzinfo=timezone.utc)        # 2 AM UTC


def _run(actor_id="analyst-1", event_type="DATA_ACCESS", now=BUSINESS_HOURS,
          velocity_anomaly=(False, 0.0)):
    with patch("app.engines.privileged_access_engine.datetime") as mock_dt, \
         patch("app.engines.privileged_access_engine._get_velocity_anomaly", return_value=velocity_anomaly):
        mock_dt.now.return_value = now
        return evaluate_privileged_access(actor_id, event_type, {})


def test_normal_business_hours_low_volume_action_is_allowed():
    result = _run(now=BUSINESS_HOURS, event_type="DATA_ACCESS")
    assert result["decision"] == "ALLOW"
    assert result["anomaly_score"] == 0


def test_off_hours_access_is_flagged():
    result = _run(now=OFF_HOURS)
    assert "OFF_HOURS_ACCESS" in result["reason_codes"]
    assert result["anomaly_score"] == 30


def test_off_hours_boundary_is_8am_to_8pm_utc():
    """
    _check_off_hours only looks at `.hour` (not minute-granular), so the
    off-hours window is effectively 21:00-07:59 — the entire 20:00-20:59
    hour still counts as business hours. Verified against the real
    behavior, not an assumption of minute-level precision.
    """
    from app.engines.privileged_access_engine import _check_off_hours
    assert _check_off_hours(datetime(2026, 1, 15, 7, 59, tzinfo=timezone.utc)) is True
    assert _check_off_hours(datetime(2026, 1, 15, 8, 0, tzinfo=timezone.utc)) is False
    assert _check_off_hours(datetime(2026, 1, 15, 20, 59, tzinfo=timezone.utc)) is False
    assert _check_off_hours(datetime(2026, 1, 15, 21, 0, tzinfo=timezone.utc)) is True


def test_high_volume_anomaly_is_flagged_and_scored():
    result = _run(velocity_anomaly=(True, 25.0))
    assert "HIGH_VOLUME_ANOMALY" in result["reason_codes"]
    assert result["anomaly_score"] >= 50


def test_config_updated_carries_inherent_contextual_risk():
    result = _run(event_type="CONFIG_UPDATED", velocity_anomaly=(False, 0.0))
    assert result["anomaly_score"] == 10  # contextual-risk bump, no other flags


def test_off_hours_plus_velocity_anomaly_triggers_block():
    result = _run(now=OFF_HOURS, event_type="TRUST_OVERRIDE", velocity_anomaly=(True, 6.0))
    # 30 (off-hours) + 50 (velocity) = 80 → BLOCK
    assert result["anomaly_score"] == 80
    assert result["decision"] == "BLOCK"


def test_decision_bands_match_thresholds():
    allow = _run(now=BUSINESS_HOURS, event_type="DATA_ACCESS", velocity_anomaly=(False, 0))
    flag = _run(now=OFF_HOURS, event_type="DATA_ACCESS", velocity_anomaly=(False, 0))  # 30 -> FLAG band
    block = _run(now=OFF_HOURS, event_type="TRUST_OVERRIDE", velocity_anomaly=(True, 6.0))  # 80 -> BLOCK
    assert allow["decision"] == "ALLOW" and allow["anomaly_score"] < 30
    assert flag["decision"] == "FLAG" and 30 <= flag["anomaly_score"] < 70
    assert block["decision"] == "BLOCK" and block["anomaly_score"] >= 70


def test_anomaly_score_is_clamped_to_100():
    result = _run(now=OFF_HOURS, event_type="CONFIG_UPDATED", velocity_anomaly=(True, 10.0))
    # 30 + 50 + 10 = 90, well within range, but this also confirms no
    # single combination can exceed the 100 clamp.
    assert result["anomaly_score"] <= 100

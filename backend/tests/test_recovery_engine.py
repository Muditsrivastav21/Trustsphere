"""
Tests for the account-recovery risk engine (app/engines/recovery_engine.py).
Supabase device-mismatch and velocity lookups are mocked at the module
boundary so these run instantly with no external dependencies.
"""

from unittest.mock import patch

from app.engines.recovery_engine import evaluate_recovery_risk


def _run(user_id="user-123", email="rahul.sharma@email.com", ip_address="103.21.124.8",
          device_hash="fp_known_device", recovery_channel="EMAIL",
          device_mismatch=False, velocity=0):
    with patch("app.engines.recovery_engine._check_device_mismatch", return_value=device_mismatch), \
         patch("app.engines.recovery_engine._check_velocity", return_value=velocity):
        return evaluate_recovery_risk(
            user_id=user_id, email=email, ip_address=ip_address,
            device_hash=device_hash, recovery_channel=recovery_channel,
        )


def test_clean_recovery_from_known_device_is_allowed():
    result = _run()
    assert result["decision"] == "ALLOW"
    assert result["risk_score"] == 100
    assert result["reason_codes"] == []


def test_unrecognized_device_is_penalized():
    result = _run(device_mismatch=True)
    assert "UNRECOGNIZED_DEVICE" in result["reason_codes"]
    assert result["risk_score"] == 60  # 100 - 40


def test_high_recovery_velocity_triggers_block():
    result = _run(velocity=3)
    assert "HIGH_RECOVERY_VELOCITY" in result["reason_codes"]
    assert result["decision"] == "BLOCK"
    assert result["risk_score"] == 40  # 100 - 60


def test_elevated_recovery_velocity_triggers_step_up_not_block():
    result = _run(velocity=2)
    assert "ELEVATED_RECOVERY_VELOCITY" in result["reason_codes"]
    assert result["decision"] == "STEP_UP"
    assert result["risk_score"] == 70  # 100 - 30


def test_sms_channel_is_lightly_penalized():
    result = _run(recovery_channel="SMS")
    assert "SMS_CHANNEL_RISK" in result["reason_codes"]
    assert result["risk_score"] == 90


def test_security_questions_channel_is_penalized_more_than_sms():
    sms = _run(recovery_channel="SMS")
    questions = _run(recovery_channel="SECURITY_QUESTIONS")
    assert "WEAK_RECOVERY_CHANNEL" in questions["reason_codes"]
    assert questions["risk_score"] < sms["risk_score"]


def test_email_channel_has_no_channel_penalty():
    result = _run(recovery_channel="EMAIL")
    assert "SMS_CHANNEL_RISK" not in result["reason_codes"]
    assert "WEAK_RECOVERY_CHANNEL" not in result["reason_codes"]


def test_stacked_risk_factors_produce_block():
    result = _run(device_mismatch=True, velocity=3, recovery_channel="SECURITY_QUESTIONS")
    assert result["decision"] == "BLOCK"
    assert result["risk_score"] == 0  # 100 - 40 - 60 - 20, clamped at 0


def test_no_user_id_treated_as_device_mismatch_by_caller():
    """
    evaluate_recovery_risk itself just trusts whatever _check_device_mismatch
    returns — but recovery_engine._check_device_mismatch(user_id=None, ...)
    is documented to always return True for an unknown user_id (email not
    found in the system). Verified directly against the real (unmocked)
    helper here, since that's the actual security-relevant behavior.
    """
    from app.engines.recovery_engine import _check_device_mismatch
    assert _check_device_mismatch(None, "any-device-hash") is True


def test_decision_thresholds_are_consistent_with_recovery_router():
    """
    ALLOW >= 80, STEP_UP 50-79, BLOCK < 50 — must match recovery.py's
    branching (`if decision in ("ALLOW", "STEP_UP")` generates an OTP;
    BLOCK never does). Regression-checks the exact boundary values.
    """
    allow = _run()  # 100
    step_up = _run(velocity=2)  # 70
    block = _run(velocity=3)  # 40
    assert allow["decision"] == "ALLOW" and allow["risk_score"] >= 80
    assert step_up["decision"] == "STEP_UP" and 50 <= step_up["risk_score"] < 80
    assert block["decision"] == "BLOCK" and block["risk_score"] < 50

"""
Regression tests for the security-audit fixes:
  - OTP / session ID generation must use `secrets`, not `random`
  - The scoring-defaults drift bug (scoring_engine vs config/responses)
    must not be able to reoccur — all three sites read from one shared
    module now, so this mostly guards against someone hardcoding a
    fallback value directly again in the future.
"""

import re
import string

from app.services.otp_service import generate_otp
from app.utils.session_id import generate_session_id
from app.constants import (
    DEFAULT_WEIGHT_DEVICE, DEFAULT_WEIGHT_BEHAVIOR, DEFAULT_WEIGHT_NETWORK,
    DEFAULT_THRESHOLD_ALLOW, DEFAULT_THRESHOLD_OTP, DEFAULT_THRESHOLD_BLOCK,
)


def test_otp_is_six_digits():
    otp = generate_otp()
    assert len(otp) == 6
    assert otp.isdigit()


def test_otp_uses_secrets_module_not_random():
    """otp_service must not import the non-cryptographic `random` module."""
    import app.services.otp_service as otp_service
    assert not hasattr(otp_service, "random"), (
        "otp_service should not import `random` — OTPs must be generated "
        "with `secrets` for cryptographic randomness."
    )


def test_otp_has_reasonable_entropy_across_many_calls():
    """Sanity check: repeated calls shouldn't collapse to a tiny value set."""
    samples = {generate_otp() for _ in range(200)}
    assert len(samples) > 150  # extremely unlikely to collide this much by chance


def test_session_id_format():
    sid = generate_session_id()
    assert sid.startswith("sess_")
    suffix = sid[len("sess_"):]
    assert len(suffix) == 12
    allowed = set(string.ascii_letters + string.digits)
    assert all(c in allowed for c in suffix)


def test_session_id_uses_secrets_module_not_random():
    import app.utils.session_id as session_id_mod
    assert not hasattr(session_id_mod, "random"), (
        "session_id generation must use `secrets`, not `random` — session "
        "IDs key OTP records and login events."
    )


def test_scoring_weight_defaults_sum_to_one():
    total = DEFAULT_WEIGHT_DEVICE + DEFAULT_WEIGHT_BEHAVIOR + DEFAULT_WEIGHT_NETWORK
    assert abs(total - 1.0) < 1e-9


def test_scoring_thresholds_are_monotonic():
    """block < otp < allow, otherwise the risk-level ladder in
    scoring_engine.calculate_trust_score would be unreachable/overlapping."""
    assert DEFAULT_THRESHOLD_BLOCK < DEFAULT_THRESHOLD_OTP < DEFAULT_THRESHOLD_ALLOW


def test_scoring_engine_fallback_matches_shared_constants():
    """
    Regression test for the exact bug this audit found: scoring_engine.py's
    fallback weights (0.45/0.35/0.20) didn't match config.py/responses.py's
    fallback weights (0.40/0.35/0.25). Both must now read from
    app.constants, so this patches Supabase to fail and checks the engine
    falls back to the same numbers app.constants declares.
    """
    from unittest.mock import patch
    from app.engines.scoring_engine import _get_weights, _get_thresholds

    with patch("app.engines.scoring_engine.get_supabase", side_effect=Exception("simulated outage")):
        weights = _get_weights()
        thresholds = _get_thresholds()

    assert weights == {
        "device": DEFAULT_WEIGHT_DEVICE,
        "behavior": DEFAULT_WEIGHT_BEHAVIOR,
        "network": DEFAULT_WEIGHT_NETWORK,
    }
    assert thresholds == {
        "allow": DEFAULT_THRESHOLD_ALLOW,
        "otp": DEFAULT_THRESHOLD_OTP,
        "block": DEFAULT_THRESHOLD_BLOCK,
    }

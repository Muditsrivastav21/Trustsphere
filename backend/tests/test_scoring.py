"""
Tests for the scoring engine logic.
These tests run without Supabase by patching the config lookups.
"""

import pytest
from unittest.mock import patch


def test_score_all_perfect():
    """All sub-scores at 100 should produce score ≈ 100."""
    with patch("app.engines.scoring_engine._get_weights", return_value={"device": 0.40, "behavior": 0.35, "network": 0.25}):
        with patch("app.engines.scoring_engine._get_thresholds", return_value={"allow": 80, "otp": 60, "block": 40}):
            from app.engines.scoring_engine import calculate_trust_score
            result = calculate_trust_score(100, 100, 100)
            assert result["trust_score"] == 100
            assert result["risk_level"] == "LOW"
            assert result["auth_action"] == "ALLOW"


def test_score_all_zero():
    """All sub-scores at 0 should produce score 0 and BLOCK."""
    with patch("app.engines.scoring_engine._get_weights", return_value={"device": 0.40, "behavior": 0.35, "network": 0.25}):
        with patch("app.engines.scoring_engine._get_thresholds", return_value={"allow": 80, "otp": 60, "block": 40}):
            from app.engines.scoring_engine import calculate_trust_score
            result = calculate_trust_score(0, 0, 0)
            assert result["trust_score"] == 0
            assert result["risk_level"] == "CRITICAL"
            assert result["auth_action"] == "BLOCK"


def test_score_medium_range():
    """Scores in the 60-79 range should trigger OTP."""
    with patch("app.engines.scoring_engine._get_weights", return_value={"device": 0.40, "behavior": 0.35, "network": 0.25}):
        with patch("app.engines.scoring_engine._get_thresholds", return_value={"allow": 80, "otp": 60, "block": 40}):
            from app.engines.scoring_engine import calculate_trust_score
            # device=70, behavior=70, network=70 → score = 70
            result = calculate_trust_score(70, 70, 70)
            assert result["trust_score"] == 70
            assert result["risk_level"] == "MEDIUM"
            assert result["auth_action"] == "OTP"


def test_weighted_formula():
    """Verify the weighted formula produces the expected result."""
    with patch("app.engines.scoring_engine._get_weights", return_value={"device": 0.40, "behavior": 0.35, "network": 0.25}):
        with patch("app.engines.scoring_engine._get_thresholds", return_value={"allow": 80, "otp": 60, "block": 40}):
            from app.engines.scoring_engine import calculate_trust_score
            # device=90, behavior=80, network=60
            # = 90*0.40 + 80*0.35 + 60*0.25 = 36 + 28 + 15 = 79
            result = calculate_trust_score(90, 80, 60)
            assert result["trust_score"] == 79
            assert result["risk_level"] == "MEDIUM"


def test_score_clamped_to_100():
    """Even with very high sub-scores, result should not exceed 100."""
    with patch("app.engines.scoring_engine._get_weights", return_value={"device": 0.40, "behavior": 0.35, "network": 0.25}):
        with patch("app.engines.scoring_engine._get_thresholds", return_value={"allow": 80, "otp": 60, "block": 40}):
            from app.engines.scoring_engine import calculate_trust_score
            result = calculate_trust_score(100, 100, 100)
            assert result["trust_score"] <= 100

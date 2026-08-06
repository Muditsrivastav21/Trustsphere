"""
Tests for the device fingerprint engine (app/engines/fingerprint_engine.py).
The Supabase device-lookup and home-timezone lookup are mocked at the
module boundary so these run instantly with no external dependencies.
The in-memory LRU-style cache is cleared between tests so results don't
leak across test cases.
"""

import pytest
from unittest.mock import patch, MagicMock

from app.engines.fingerprint_engine import evaluate_device, _device_cache

CHROME_WIN_UA = "Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/125.0.0.0 Safari/537.36"
HEADLESS_UA = "Mozilla/5.0 (Windows NT 10.0; Win64) HeadlessChrome/125.0.0.0 Safari/537.36"
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"


@pytest.fixture(autouse=True)
def clear_device_cache():
    _device_cache.clear()
    yield
    _device_cache.clear()


def _run(user_id="user-123", user_agent=CHROME_WIN_UA, timezone="Asia/Kolkata",
          screen_res="1920x1080", language="en-US", platform="Win32", touch_points=0,
          known_device=None, home_timezone="Asia/Kolkata"):
    """known_device: None (unknown) or {"trust_level": "TRUSTED"|"KNOWN"}"""
    mock_sb = MagicMock()

    def table_side_effect(name):
        m = MagicMock()
        if name == "device_fingerprints":
            m.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = (
                [known_device] if known_device else []
            )
        elif name == "users":
            m.select.return_value.eq.return_value.execute.return_value.data = [
                {"home_timezone": home_timezone}
            ]
        return m

    mock_sb.table.side_effect = table_side_effect

    device_signals = {
        "user_agent": user_agent, "timezone": timezone, "screen_res": screen_res,
        "language": language, "platform": platform, "touch_points": touch_points,
    }
    with patch("app.engines.fingerprint_engine.get_supabase", return_value=mock_sb):
        return evaluate_device(user_id, device_signals)


def test_unknown_device_is_penalized_and_flagged():
    result = _run(known_device=None)
    assert result["is_known_device"] is False
    assert "NEW_DEVICE" in result["flags"]
    assert result["device_score"] == 65  # 100 - 35


def test_known_device_gets_no_new_device_penalty():
    result = _run(known_device={"trust_level": "KNOWN"})
    assert result["is_known_device"] is True
    assert "NEW_DEVICE" not in result["flags"]
    assert result["device_score"] == 100


def test_trusted_device_bonus_is_visible_when_stacked_with_a_penalty():
    """
    The +5 trusted-device bonus is a no-op in isolation (100 is already the
    ceiling) but matters once another penalty is also in play — verifies
    the bonus is applied *before* the final clamp, not silently discarded.
    Uses two distinct user_ids so the 60s device-lookup cache (correctly)
    doesn't serve the second call's assertion from the first call's result.
    """
    known_untrusted = _run(user_id="user-untrusted", known_device={"trust_level": "KNOWN"}, timezone="America/New_York", home_timezone="Asia/Kolkata")
    known_trusted = _run(user_id="user-trusted", known_device={"trust_level": "TRUSTED"}, timezone="America/New_York", home_timezone="Asia/Kolkata")
    assert known_trusted["device_score"] == known_untrusted["device_score"] + 5


def test_headless_browser_is_detected_and_heavily_penalized():
    result = _run(user_agent=HEADLESS_UA, known_device={"trust_level": "TRUSTED"})
    assert "HEADLESS_BROWSER" in result["flags"]
    assert result["device_score"] <= 65  # 105 (known+trusted) - 40


def test_unexpected_timezone_is_penalized():
    result = _run(known_device={"trust_level": "KNOWN"}, timezone="America/New_York", home_timezone="Asia/Kolkata")
    assert "UNEXPECTED_TIMEZONE" in result["flags"]
    assert result["device_score"] == 80  # 100 - 20


def test_matching_timezone_is_not_penalized():
    result = _run(known_device={"trust_level": "KNOWN"}, timezone="Asia/Kolkata", home_timezone="Asia/Kolkata")
    assert "UNEXPECTED_TIMEZONE" not in result["flags"]


def test_mobile_user_agent_with_zero_touch_points_is_penalized():
    result = _run(user_agent=IPHONE_UA, touch_points=0, known_device={"trust_level": "KNOWN"})
    assert "TOUCH_MISMATCH" in result["flags"]
    assert result["device_score"] == 85  # 100 - 15


def test_mobile_user_agent_with_touch_points_is_not_penalized():
    result = _run(user_agent=IPHONE_UA, touch_points=5, known_device={"trust_level": "KNOWN"})
    assert "TOUCH_MISMATCH" not in result["flags"]


def test_desktop_user_agent_with_zero_touch_points_is_fine():
    result = _run(user_agent=CHROME_WIN_UA, touch_points=0, known_device={"trust_level": "KNOWN"})
    assert "TOUCH_MISMATCH" not in result["flags"]


def test_fingerprint_hash_is_deterministic_for_same_signals():
    r1 = _run(user_agent=CHROME_WIN_UA, timezone="Asia/Kolkata", screen_res="1920x1080")
    r2 = _run(user_agent=CHROME_WIN_UA, timezone="Asia/Kolkata", screen_res="1920x1080")
    assert r1["fingerprint_hash"] == r2["fingerprint_hash"]


def test_device_score_is_clamped_to_zero_and_hundred():
    # Stack every possible penalty at once.
    result = _run(
        user_agent=HEADLESS_UA + " Mobile",
        timezone="America/New_York", home_timezone="Asia/Kolkata",
        touch_points=0, known_device=None,
    )
    assert 0 <= result["device_score"] <= 100


def test_repeated_lookup_uses_cache_not_a_second_db_call():
    """The 60s TTL in-memory cache should serve the second identical lookup
    without hitting Supabase again."""
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
    mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"home_timezone": "Asia/Kolkata"}
    ]
    device_signals = {
        "user_agent": CHROME_WIN_UA, "timezone": "Asia/Kolkata", "screen_res": "1920x1080",
        "language": "en-US", "platform": "Win32", "touch_points": 0,
    }
    with patch("app.engines.fingerprint_engine.get_supabase", return_value=mock_sb):
        evaluate_device("user-cache-test", device_signals)
        evaluate_device("user-cache-test", device_signals)

    # device_fingerprints table should only be queried once across both calls.
    device_fp_calls = [c for c in mock_sb.table.call_args_list if c.args == ("device_fingerprints",)]
    assert len(device_fp_calls) == 1

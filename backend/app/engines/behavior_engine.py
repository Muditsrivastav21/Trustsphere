"""
TrustSphere AI — Behavioral Biometrics Engine
Evaluates keystroke dynamics and mouse telemetry to detect bots
and anomalous human behavior.  Calls the IsolationForest ML model.
"""

from __future__ import annotations
from app.services.ml_service import predict_anomaly
from app.utils.logger import logger


def evaluate_behavior(behavior: dict) -> dict:
    """
    Score the behavioral signals from 0–100 and return flags.

    Parameters
    ----------
    behavior : dict
        Keys: key_hold_times, flight_times, typing_speed_wpm,
              mouse_speeds, mouse_event_count, total_keystrokes.

    Returns
    -------
    dict with keys: behavior_score, anomaly_score, flags
    """
    wpm = behavior.get("typing_speed_wpm", 0.0)
    avg_hold = 0.0
    hold_times = behavior.get("key_hold_times", [])
    if hold_times:
        avg_hold = sum(hold_times) / len(hold_times)

    mouse_speeds = behavior.get("mouse_speeds", [])
    mouse_speed_avg = 0.0
    if mouse_speeds:
        mouse_speed_avg = sum(mouse_speeds) / len(mouse_speeds)

    total_keystrokes = behavior.get("total_keystrokes", 0)

    score = 100
    flags: list[str] = []

    # --- Rule-based checks ---
    if wpm > 120:
        score -= 30
        flags.append("BOT_TYPING_SPEED")

    if wpm < 8 and total_keystrokes > 5:
        score -= 15
        flags.append("UNUSUALLY_SLOW")

    if avg_hold < 25 and total_keystrokes > 0:
        score -= 25
        flags.append("BOT_KEYSTROKE_PATTERN")

    if mouse_speed_avg == 0:
        score -= 20
        flags.append("NO_MOUSE_MOVEMENT")

    # --- ML anomaly detection ---
    anomaly_score = 0.0
    xai_explanations = []
    try:
        flight_times = behavior.get("flight_times", [])
        anomaly_score, is_anomaly, xai_explanations = predict_anomaly(
            hold_times, flight_times, mouse_speeds, wpm
        )
        if is_anomaly:
            score -= 20
            flags.append("BEHAVIORAL_ANOMALY")

    except Exception as e:
        logger.warning(f"ML prediction failed, skipping: {e}")

    score = max(0, min(100, score))

    return {
        "behavior_score": score,
        "anomaly_score": anomaly_score,
        "typing_speed_wpm": wpm,
        "avg_hold_time_ms": avg_hold,
        "mouse_speed_avg": mouse_speed_avg,
        "flags": flags,
        "xai_explanations": xai_explanations,
    }

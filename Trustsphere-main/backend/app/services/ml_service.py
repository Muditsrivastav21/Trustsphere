"""
TrustSphere AI — ML Service
Loads the pre-trained IsolationForest model and predicts anomalies
from behavioral biometric features.
"""

from __future__ import annotations
import os
import pickle
import numpy as np
from app.utils.logger import logger

_model = None
_MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "ml", "model.pkl")


def _load_model():
    """Lazily load the pickled IsolationForest model."""
    global _model
    if _model is not None:
        return _model

    abs_path = os.path.abspath(_MODEL_PATH)
    if not os.path.exists(abs_path):
        logger.warning(f"ML model not found at {abs_path} — anomaly detection disabled")
        return None

    try:
        with open(abs_path, "rb") as f:
            _model = pickle.load(f)
        logger.info("IsolationForest model loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load ML model: {e}")
        _model = None
    return _model


def predict_anomaly(
    hold_times: list[float],
    flight_times: list[float],
    mouse_speeds: list[float],
    wpm: float,
) -> tuple[float, bool, list[str]]:
    """
    Run IsolationForest on behavioral features.

    Returns
    -------
    (anomaly_score: float, is_anomaly: bool, explanations: list[str])
    anomaly_score is the raw decision_function value (more negative = more anomalous).
    is_anomaly is True if the model considers the sample an outlier.
    """
    explanations = []
    
    if wpm > 120:
        explanations.append(f"Typing speed ({wpm} WPM) exceeds normal human thresholds (likely bot/script).")
    
    model = _load_model()
    if model is None:
        return (0.0, False, explanations)

    # Build a feature vector:
    #   [avg_hold, std_hold, avg_flight, std_flight, avg_mouse, wpm]
    avg_hold = float(np.mean(hold_times)) if hold_times else 0.0
    std_hold = float(np.std(hold_times)) if len(hold_times) > 1 else 0.0
    avg_flight = float(np.mean(flight_times)) if flight_times else 0.0
    std_flight = float(np.std(flight_times)) if len(flight_times) > 1 else 0.0
    avg_mouse = float(np.mean(mouse_speeds)) if mouse_speeds else 0.0

    features = np.array([[avg_hold, std_hold, avg_flight, std_flight, avg_mouse, wpm]])

    if avg_flight > 0 and avg_flight < 50:
        explanations.append("Unusually fast keystroke transitions (avg flight time < 50ms).")

    try:
        prediction = model.predict(features)[0]       # 1 = normal, -1 = anomaly
        score = model.decision_function(features)[0]   # continuous score
        
        if prediction == -1 and len(explanations) == 0:
            explanations.append("IsolationForest detected anomalous overall behavior pattern.")
            
        return (float(score), prediction == -1, explanations)
    except Exception as e:
        logger.warning(f"ML prediction error: {e}")
        return (0.0, False, explanations)

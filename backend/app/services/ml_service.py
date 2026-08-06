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
_ML_SOURCE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "ml")
_MODEL_PATH = os.path.join(_ML_SOURCE_DIR, "model.pkl")


def _train_and_persist_model():
    """
    Train a fresh IsolationForest on synthetic normal/bot data and save it
    to disk, so a missing model.pkl self-heals on first use instead of
    silently disabling anomaly detection for the rest of the process
    lifetime. Mirrors ml/train_model.py exactly (same params/seed) — that
    script remains the explicit, offline way to (re)train; this is the
    safety net for whenever someone forgets to run it first.
    """
    from sklearn.ensemble import IsolationForest

    # Deliberately anchored to this module's own fixed location (not
    # _MODEL_PATH) — tests override _MODEL_PATH to a temp directory for
    # isolation, but synthetic_data.py only ever lives in the real ml/
    # source directory.
    import sys
    sys.path.insert(0, os.path.abspath(_ML_SOURCE_DIR))
    from synthetic_data import generate_normal_samples  # type: ignore

    normal = generate_normal_samples(n=500, seed=42)
    model = IsolationForest(
        n_estimators=100,
        contamination=0.1,
        random_state=42,
        max_samples="auto",
    )
    model.fit(normal)

    try:
        abs_path = os.path.abspath(_MODEL_PATH)
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        with open(abs_path, "wb") as f:
            pickle.dump(model, f)
        logger.info(f"Auto-trained IsolationForest model and saved it to {abs_path}")
    except Exception as e:
        # Persisting is best-effort — an unwritable ml/ dir (e.g. read-only
        # container filesystem) shouldn't stop the model from being usable
        # for this process's lifetime.
        logger.warning(f"Trained a fresh model but could not persist it to disk: {e}")

    return model


def _load_model():
    """
    Lazily load the pickled IsolationForest model, training and persisting
    a fresh one automatically if model.pkl doesn't exist yet.
    """
    global _model
    if _model is not None:
        return _model

    abs_path = os.path.abspath(_MODEL_PATH)
    if not os.path.exists(abs_path):
        logger.warning(f"ML model not found at {abs_path} — auto-training a fresh one now")
        try:
            _model = _train_and_persist_model()
        except Exception as e:
            logger.error(f"Auto-training the ML model failed: {e} — anomaly detection disabled")
            _model = None
        return _model

    try:
        with open(abs_path, "rb") as f:
            _model = pickle.load(f)
        logger.info("IsolationForest model loaded successfully")
    except Exception as e:
        logger.warning(f"Failed to load existing ML model ({e}) — retraining a fresh one")
        try:
            _model = _train_and_persist_model()
        except Exception as e2:
            logger.error(f"Auto-training the ML model failed: {e2} — anomaly detection disabled")
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

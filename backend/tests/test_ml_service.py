"""
Tests for app/services/ml_service.py — in particular, that a missing
model.pkl self-heals via auto-training instead of silently disabling
anomaly detection for the rest of the process lifetime (this exact gap
was caught live by tests/load_test.py logging "ML model not found" on
every one of 500 iterations before this fix).
"""

import os
import tempfile
import importlib


def test_missing_model_auto_trains_and_persists(tmp_path, monkeypatch):
    import app.services.ml_service as ml_service

    fake_model_path = tmp_path / "model.pkl"
    monkeypatch.setattr(ml_service, "_MODEL_PATH", str(fake_model_path))
    monkeypatch.setattr(ml_service, "_model", None)

    assert not fake_model_path.exists()

    model = ml_service._load_model()

    assert model is not None
    assert fake_model_path.exists(), "auto-trained model should be persisted to disk"


def test_predict_anomaly_works_after_auto_training(tmp_path, monkeypatch):
    import app.services.ml_service as ml_service

    fake_model_path = tmp_path / "model.pkl"
    monkeypatch.setattr(ml_service, "_MODEL_PATH", str(fake_model_path))
    monkeypatch.setattr(ml_service, "_model", None)

    # Clearly bot-like: very short, very consistent hold/flight times, high WPM.
    score, is_anomaly, explanations = ml_service.predict_anomaly(
        hold_times=[15.0, 14.0, 16.0, 15.5] * 5,
        flight_times=[18.0, 19.0, 17.5, 18.2] * 5,
        mouse_speeds=[10.0, 12.0],
        wpm=155.0,
    )
    # `is_anomaly` comes back as numpy.bool_ (from `prediction == -1`), not
    # a Python bool — correct in a truthy/boolean context (which is how
    # behavior_engine.py actually uses it: `if is_anomaly: ...`), but
    # `numpy.bool_(True) is True` is False, so assert truthiness, not identity.
    assert is_anomaly
    assert isinstance(score, float)
    assert len(explanations) > 0


def test_corrupt_model_file_is_retrained_not_fatal(tmp_path, monkeypatch):
    import app.services.ml_service as ml_service

    corrupt_path = tmp_path / "model.pkl"
    corrupt_path.write_bytes(b"this is not a valid pickle file")
    monkeypatch.setattr(ml_service, "_MODEL_PATH", str(corrupt_path))
    monkeypatch.setattr(ml_service, "_model", None)

    model = ml_service._load_model()
    assert model is not None, "a corrupt model.pkl should trigger a retrain, not a crash"

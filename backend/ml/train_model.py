"""
TrustSphere AI — IsolationForest Training Script
Run this ONCE before starting the server:
    python ml/train_model.py

Trains an IsolationForest model on synthetic behavioral biometric
data and saves it to ml/model.pkl.
"""

import os
import pickle
import numpy as np
from sklearn.ensemble import IsolationForest

# Import from sibling module
import sys
sys.path.insert(0, os.path.dirname(__file__))
from synthetic_data import generate_normal_samples, generate_anomalous_samples


def train_and_save():
    print("=" * 50)
    print("TrustSphere AI — Training IsolationForest")
    print("=" * 50)

    # Generate training data (train on normal only — unsupervised)
    normal = generate_normal_samples(n=500, seed=42)
    print(f"  Normal samples: {normal.shape}")

    # Train
    model = IsolationForest(
        n_estimators=100,
        contamination=0.1,
        random_state=42,
        max_samples="auto",
    )
    model.fit(normal)
    print("  Model trained.")

    # Quick validation
    anomalous = generate_anomalous_samples(n=50, seed=99)
    normal_preds = model.predict(normal[:50])
    anomalous_preds = model.predict(anomalous)

    normal_accuracy = (normal_preds == 1).sum() / len(normal_preds) * 100
    anomaly_detection = (anomalous_preds == -1).sum() / len(anomalous_preds) * 100

    print(f"  Normal correctly classified: {normal_accuracy:.1f}%")
    print(f"  Anomalies detected: {anomaly_detection:.1f}%")

    # Save model
    model_path = os.path.join(os.path.dirname(__file__), "model.pkl")
    with open(model_path, "wb") as f:
        pickle.dump(model, f)

    print(f"  Model saved to: {model_path}")
    print("=" * 50)


if __name__ == "__main__":
    train_and_save()

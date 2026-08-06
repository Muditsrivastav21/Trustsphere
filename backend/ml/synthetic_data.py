"""
TrustSphere AI — Synthetic Training Data Generator
Generates normal and anomalous behavioral biometric samples
for training the IsolationForest model.
"""

import numpy as np


def generate_normal_samples(n: int = 500, seed: int = 42) -> np.ndarray:
    """
    Generate normal (legitimate user) behavioral feature vectors.
    Features: [avg_hold, std_hold, avg_flight, std_flight, avg_mouse, wpm]
    """
    rng = np.random.default_rng(seed)
    samples = np.column_stack([
        rng.normal(85, 20, n),     # avg_hold_time_ms  (70–120 ms typical)
        rng.normal(15, 5, n),      # std_hold
        rng.normal(120, 30, n),    # avg_flight_time_ms (100–160 ms typical)
        rng.normal(25, 8, n),      # std_flight
        rng.normal(350, 100, n),   # avg_mouse_speed px/s (200–500 typical)
        rng.normal(45, 15, n),     # typing_speed_wpm  (30–70 typical human)
    ])
    # Clip negative values
    samples = np.clip(samples, 0, None)
    return samples


def generate_anomalous_samples(n: int = 50, seed: int = 99) -> np.ndarray:
    """
    Generate anomalous (bot / attacker) behavioral feature vectors.
    Bots type very fast with very consistent timing.
    """
    rng = np.random.default_rng(seed)
    samples = np.column_stack([
        rng.normal(15, 5, n),      # avg_hold — very short (bot-like)
        rng.normal(2, 1, n),       # std_hold — very consistent
        rng.normal(20, 8, n),      # avg_flight — very short
        rng.normal(3, 1, n),       # std_flight — very consistent
        rng.normal(50, 30, n),     # avg_mouse_speed — low or zero
        rng.normal(150, 30, n),    # wpm — very fast (bot-like)
    ])
    samples = np.clip(samples, 0, None)
    return samples


if __name__ == "__main__":
    normal = generate_normal_samples()
    anomalous = generate_anomalous_samples()
    print(f"Generated {len(normal)} normal + {len(anomalous)} anomalous samples")
    print(f"Normal sample [0]: {normal[0]}")
    print(f"Anomalous sample [0]: {anomalous[0]}")

"""
TrustSphere AI — SHA-256 Fingerprint Hashing
Generates a deterministic hash from device/browser signals.
"""

import hashlib


def generate_fingerprint_hash(
    user_agent: str,
    timezone: str,
    screen_res: str,
    language: str,
    platform: str,
) -> str:
    """
    Produce a SHA-256 hex digest from the concatenation of browser signals.
    The same device + browser combination always yields the same hash.
    """
    raw = f"{user_agent}|{timezone}|{screen_res}|{language}|{platform}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def hash_string(value: str) -> str:
    """Produce a SHA-256 hex digest of an arbitrary string (e.g. a government ID)."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

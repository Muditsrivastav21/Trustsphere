"""
Tests for the fingerprint hashing utility.
"""

from app.utils.hashing import generate_fingerprint_hash


def test_deterministic_hash():
    """Same inputs should produce the same hash."""
    h1 = generate_fingerprint_hash("Chrome/125", "Asia/Kolkata", "1920x1080", "en-US", "Win32")
    h2 = generate_fingerprint_hash("Chrome/125", "Asia/Kolkata", "1920x1080", "en-US", "Win32")
    assert h1 == h2


def test_different_inputs_different_hash():
    """Different inputs should produce different hashes."""
    h1 = generate_fingerprint_hash("Chrome/125", "Asia/Kolkata", "1920x1080", "en-US", "Win32")
    h2 = generate_fingerprint_hash("Safari/604", "Asia/Kolkata", "1920x1080", "en-US", "MacIntel")
    assert h1 != h2


def test_hash_is_hex():
    """Hash should be a valid hex string of length 64 (SHA-256)."""
    h = generate_fingerprint_hash("Test", "UTC", "1024x768", "en", "Linux")
    assert len(h) == 64
    assert all(c in "0123456789abcdef" for c in h)


def test_hash_handles_empty_strings():
    """Should handle empty strings without error."""
    h = generate_fingerprint_hash("", "", "", "", "")
    assert len(h) == 64

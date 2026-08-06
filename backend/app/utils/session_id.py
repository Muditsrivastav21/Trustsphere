"""
TrustSphere AI — Session ID Generator
Produces unique session identifiers with a "sess_" prefix.
"""

import secrets
import string


def generate_session_id() -> str:
    """
    Return a session ID like 'sess_k8x2mQpL' (12 cryptographically random
    alphanumerics). Uses `secrets` rather than `random` — session IDs key
    OTP records and login events, so they shouldn't be generated with a
    non-cryptographic PRNG. Bumped from 8 to 12 chars for extra headroom
    against brute-force guessing.
    """
    chars = string.ascii_letters + string.digits
    suffix = "".join(secrets.choice(chars) for _ in range(12))
    return f"sess_{suffix}"

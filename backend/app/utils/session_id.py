"""
TrustSphere AI — Session ID Generator
Produces unique session identifiers with a "sess_" prefix.
"""

import random
import string


def generate_session_id() -> str:
    """Return a session ID like 'sess_k8x2mQpL' (8 random alphanumerics)."""
    chars = string.ascii_letters + string.digits
    suffix = "".join(random.choices(chars, k=8))
    return f"sess_{suffix}"

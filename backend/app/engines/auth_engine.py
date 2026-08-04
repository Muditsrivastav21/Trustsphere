"""
TrustSphere AI — Auth Decision Engine
Thin wrapper that determines the ALLOW / OTP / BLOCK outcome
based on the trust score.  The heavy lifting happens in scoring_engine.
This module exists so that callers have a clean single function to call.
"""

from __future__ import annotations


def determine_auth_action(trust_score: int, risk_level: str) -> str:
    """
    Return the auth action string for the given trust score.
    This mirrors the logic in scoring_engine but can be called
    independently when replaying a stored score.
    """
    if risk_level == "CRITICAL":
        return "BLOCK"
    if risk_level in ("HIGH", "MEDIUM"):
        return "OTP"
    return "ALLOW"

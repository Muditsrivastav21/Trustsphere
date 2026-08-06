"""
TrustSphere AI — Shared Scoring Defaults
Single source of truth for the scoring weights/thresholds used whenever
`system_config` in Supabase is unreachable. These MUST match across every
fallback site — scoring_engine.py (the engine that actually enforces
them on live logins), config.py (what the dashboard reads/displays), and
responses.py's Pydantic model defaults — or a Supabase outage would
silently make the dashboard display different numbers than what's
actually being enforced. (This drift already existed before this fix:
scoring_engine.py's fallback used device=0.45/network=0.20 while
config.py and responses.py used device=0.40/network=0.25.)
"""

DEFAULT_WEIGHT_DEVICE = 0.40
DEFAULT_WEIGHT_BEHAVIOR = 0.35
DEFAULT_WEIGHT_NETWORK = 0.25

DEFAULT_THRESHOLD_ALLOW = 80
DEFAULT_THRESHOLD_OTP = 68
DEFAULT_THRESHOLD_BLOCK = 56

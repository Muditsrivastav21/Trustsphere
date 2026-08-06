"""
TrustSphere AI — Pydantic Response Models
Defines the exact JSON shapes the frontend expects.
"""

from __future__ import annotations
from pydantic import BaseModel
from typing import Optional


# ─── Auth / Score ───────────────────────────────────────────

class UserInfo(BaseModel):
    name: str
    customer_id: str
    city: str
    account_type: str


class LocationInfo(BaseModel):
    country: str
    city: str
    ip: str


class ComponentScores(BaseModel):
    device: int
    behavior: int
    network: int


class LoginResponse(BaseModel):
    session_id: str
    user: UserInfo
    trust_score: int
    risk_level: str
    auth_action: str
    component_scores: ComponentScores
    flags: list[str]
    is_known_device: bool
    location: LocationInfo
    timestamp: str
    demo_otp: Optional[str] = None


class ContinuousAuthResponse(BaseModel):
    status: str
    anomaly_score: float
    flags: list[str]


# ─── Dashboard Stats ────────────────────────────────────────

class DeltaStats(BaseModel):
    total_logins_last_hour: int = 0
    high_risk_last_hour: int = 0


class OverviewResponse(BaseModel):
    total_logins_today: int = 0
    high_risk_count: int = 0
    blocked_count: int = 0
    fraud_rings_detected: int = 0
    avg_trust_score: float = 0.0
    otp_triggered_count: int = 0
    delta: DeltaStats = DeltaStats()
    flagged_onboarding_count: int = 0
    flagged_recovery_count: int = 0
    insider_alerts_count: int = 0


class RiskDistributionResponse(BaseModel):
    low: int = 0
    medium: int = 0
    high: int = 0
    critical: int = 0


# ─── Sessions ───────────────────────────────────────────────

class SessionRow(BaseModel):
    session_id: str
    user_name: str
    customer_id: str
    timestamp: str
    ip_address: str
    location: str
    trust_score: int
    risk_level: str
    auth_action: str
    is_known_device: bool
    flags: list[str]


class SessionsListResponse(BaseModel):
    sessions: list[SessionRow]
    total: int
    page: int
    limit: int
    pages: int


# ─── Graph ──────────────────────────────────────────────────

class GraphNode(BaseModel):
    id: str
    type: str
    label: str
    risk_flag: bool = False
    connections: int = 0


class GraphEdge(BaseModel):
    source: str
    target: str
    relationship: str
    suspicious: bool = False


class GraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


# ─── Config ─────────────────────────────────────────────────

class WeightsInfo(BaseModel):
    device: float = 0.40
    behavior: float = 0.35
    network: float = 0.25


class ThresholdsResponse(BaseModel):
    # Fallback defaults — used only if the system_config table is unreadable.
    # Must stay in sync with the live system_config row values and with
    # scoring_engine.py's _get_thresholds() defaults, or the dashboard could
    # display thresholds that don't match what's actually being enforced.
    threshold_allow: int = 80
    threshold_otp: int = 68
    threshold_block: int = 56
    weights: WeightsInfo = WeightsInfo()


# ─── OTP ────────────────────────────────────────────────────

class OtpVerifyResponse(BaseModel):
    verified: bool
    message: str


# ─── Audit Log ──────────────────────────────────────────────

class AuditEntry(BaseModel):
    id: str
    event_type: str
    description: Optional[str] = None
    metadata: Optional[dict] = None
    created_at: str


class AuditLogResponse(BaseModel):
    entries: list[AuditEntry]
    total: int
    page: int
    limit: int
    pages: int


# ─── Onboarding ─────────────────────────────────────────────

class OnboardingResponse(BaseModel):
    id: str
    decision: str
    risk_score: int
    reason_codes: list[str]
    timestamp: str


class OnboardingAttemptRow(BaseModel):
    id: str
    name: str
    email: str
    phone: str
    aadhaar_number: str
    pan_number: str
    device_hash: str
    risk_score: int
    decision: str
    reason_codes: list[str]
    timestamp: str


class OnboardingListResponse(BaseModel):
    attempts: list[OnboardingAttemptRow]
    total: int
    page: int
    limit: int
    pages: int


# ─── Recovery ─────────────────────────────────────────────

class RecoveryInitResponse(BaseModel):
    session_id: str
    decision: str
    risk_score: int
    reason_codes: list[str]
    message: str


class ResetPasswordResponse(BaseModel):
    success: bool
    message: str

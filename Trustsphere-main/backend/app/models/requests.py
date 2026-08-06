"""
TrustSphere AI — Pydantic Request Models
Defines the shape of incoming POST bodies from the frontend.
"""

from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional


class DeviceSignals(BaseModel):
    """Browser / device signals collected on the login page."""
    user_agent: str = ""
    timezone: str = "Asia/Kolkata"
    screen_res: str = "1920x1080"
    language: str = "en-US"
    platform: str = "Win32"
    color_depth: int = 24
    touch_points: int = 0


class BehaviorSignals(BaseModel):
    """Keystroke and mouse telemetry captured during form fill."""
    key_hold_times: list[float] = Field(default_factory=list)
    flight_times: list[float] = Field(default_factory=list)
    typing_speed_wpm: float = 0.0
    mouse_speeds: list[float] = Field(default_factory=list)
    mouse_event_count: int = 0
    total_keystrokes: int = 0


class LoginRequest(BaseModel):
    """POST /api/auth/login body."""
    customer_id: str
    password: str = ""  # not verified in prototype
    ip_address: str = "127.0.0.1"
    device: DeviceSignals = Field(default_factory=DeviceSignals)
    behavior: BehaviorSignals = Field(default_factory=BehaviorSignals)


class OnboardingRequest(BaseModel):
    """POST /api/onboarding/signup body."""
    name: str
    email: str
    phone: str
    dob: str
    id_number: str
    password: str = ""
    ip_address: str = "127.0.0.1"
    device: DeviceSignals = Field(default_factory=DeviceSignals)
    behavior: BehaviorSignals = Field(default_factory=BehaviorSignals)


class VerifyOtpRequest(BaseModel):
    """POST /api/auth/verify-otp body."""
    session_id: str
    otp_code: str


class ContinuousAuthRequest(BaseModel):
    """POST /api/auth/continuous body."""
    session_id: str
    behavior: BehaviorSignals = Field(default_factory=BehaviorSignals)
    ip_address: Optional[str] = None
    device: Optional[DeviceSignals] = None


class RecoveryInitRequest(BaseModel):
    """POST /api/recovery/initiate body."""
    email: str
    recovery_channel: str = "EMAIL"
    ip_address: str = "127.0.0.1"
    device: DeviceSignals = Field(default_factory=DeviceSignals)
    behavior: BehaviorSignals = Field(default_factory=BehaviorSignals)


class RecoveryVerifyRequest(BaseModel):
    """POST /api/recovery/verify body."""
    session_id: str
    otp_code: str


class ThresholdsUpdateRequest(BaseModel):
    """PUT /api/config/thresholds body."""
    threshold_allow: Optional[int] = None
    threshold_otp: Optional[int] = None
    threshold_block: Optional[int] = None
    weight_device: Optional[float] = None
    weight_behavior: Optional[float] = None
    weight_network: Optional[float] = None

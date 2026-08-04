"""
TrustSphere AI — OTP Service
Generates, stores, and verifies one-time passwords.
"""

from __future__ import annotations

import random
import string
from datetime import datetime, timedelta, timezone

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.database.supabase_client import get_supabase
from app.utils.logger import logger
from app.config.settings import settings


def generate_otp() -> str:
    """Return a random 6-digit numeric OTP."""
    return "".join(random.choices(string.digits, k=6))

def send_email_otp(to_email: str, otp_code: str) -> None:
    """Send OTP via Gmail SMTP."""
    sender = settings.GMAIL_SENDER
    password = settings.GMAIL_APP_PASSWORD
    
    if not sender or not password:
        logger.warning("Email credentials missing. Not sending OTP.")
        return

    msg = MIMEMultipart()
    msg['From'] = f"TrustSphere AI <{sender}>"
    msg['To'] = to_email
    msg['Subject'] = "Bank of Baroda - Your Security Code"
    
    body = f"""
    <h2>Bank of Baroda Security Alert</h2>
    <p>We detected an unusual login attempt. Please use the following code to verify your identity.</p>
    <h1 style="color: #F26522; letter-spacing: 5px;">{otp_code}</h1>
    <p>Do not share this code with anyone. It expires in 5 minutes.</p>
    """
    msg.attach(MIMEText(body, 'html'))
    
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=5.0) as server:
            server.login(sender, password)
            server.send_message(msg)
            logger.info(f"OTP email sent successfully to {to_email}")
    except Exception as e:
        logger.error(f"Failed to send email OTP: {e}")


def store_otp(session_id: str, otp_code: str) -> None:
    """
    Save the OTP in the otp_sessions table with a 5-minute TTL.
    """
    sb = get_supabase()
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()

    sb.table("otp_sessions").upsert(
        {
            "session_id": session_id,
            "otp_code": otp_code,
            "used": False,
            "expires_at": expires_at,
        },
        on_conflict="session_id",
    ).execute()

    logger.info(f"OTP stored for session {session_id} (expires {expires_at})")


def verify_otp(session_id: str, otp_code: str) -> tuple[bool, str]:
    """
    Check the OTP against the stored value.

    Returns
    -------
    (verified: bool, message: str)
    """
    sb = get_supabase()
    try:
        result = (
            sb.table("otp_sessions")
            .select("*")
            .eq("session_id", session_id)
            .eq("otp_code", otp_code)
            .eq("used", False)
            .execute()
        )
        if not result.data:
            return (False, "Invalid or expired OTP.")

        row = result.data[0]
        expires_at = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > expires_at:
            return (False, "OTP has expired. Please request a new one.")

        # Mark used
        sb.table("otp_sessions").update({"used": True}).eq("session_id", session_id).execute()
        return (True, "Identity confirmed. Proceed to banking.")

    except Exception as e:
        logger.error(f"OTP verification error: {e}")
        return (False, "Verification failed due to a server error.")

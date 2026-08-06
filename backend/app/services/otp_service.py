"""
TrustSphere AI — OTP Service
Generates, stores, and verifies one-time passwords.
"""

from __future__ import annotations

import secrets
import string
from datetime import datetime, timedelta, timezone

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.database.supabase_client import get_supabase
from app.utils.logger import logger
from app.config.settings import settings


def generate_otp() -> str:
    """
    Return a cryptographically random 6-digit numeric OTP.
    Uses `secrets` rather than `random` — this code gates account access,
    and `random`'s Mersenne Twister state is not suitable for anything
    security-sensitive (it's predictable from enough prior outputs).
    """
    return "".join(secrets.choice(string.digits) for _ in range(6))

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

        # Mark used, and stamp verified_at — used by the recovery flow's
        # reset-password endpoint to enforce a short window between OTP
        # verification and actually resetting the password (see
        # recovery.py). Harmless bookkeeping for the plain login-OTP path.
        sb.table("otp_sessions").update({
            "used": True,
            "verified_at": datetime.now(timezone.utc).isoformat(),
        }).eq("session_id", session_id).execute()
        return (True, "Identity confirmed. Proceed to banking.")

    except Exception as e:
        logger.error(f"OTP verification error: {e}")
        return (False, "Verification failed due to a server error.")


def send_password_changed_email(to_email: str) -> None:
    """
    Send a "your password was changed" notification via Gmail SMTP.
    Deliberately a separate function from send_email_otp — this is a
    post-fact security notification, not a code the user needs to act on,
    and should never be confused with (or accidentally reuse) the OTP
    template.
    """
    sender = settings.GMAIL_SENDER
    password = settings.GMAIL_APP_PASSWORD

    if not sender or not password:
        logger.warning("Email credentials missing. Not sending password-changed notification.")
        return

    msg = MIMEMultipart()
    msg['From'] = f"TrustSphere AI <{sender}>"
    msg['To'] = to_email
    msg['Subject'] = "Bank of Baroda - Your password was changed"

    body = """
    <h2>Bank of Baroda Security Alert</h2>
    <p>Your account password was just changed via the account recovery flow.</p>
    <p>If this was you, no further action is needed.</p>
    <p style="color: #E8384F; font-weight: bold;">If you did not make this change, please contact support immediately — your account may be compromised.</p>
    """
    msg.attach(MIMEText(body, 'html'))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=5.0) as server:
            server.login(sender, password)
            server.send_message(msg)
            logger.info(f"Password-changed notification sent to {to_email}")
    except Exception as e:
        logger.error(f"Failed to send password-changed notification: {e}")

"""
TrustSphere AI — Onboarding/KYC Risk Engine
Evaluates onboarding/signup risk based on PII consistency,
device velocity, and behavioral bot signals.

KYC requires two separate government ID documents:
  - Aadhaar Card (primary photo ID — used for face verification)
  - PAN Card (secondary financial identity document)
Both are OCR'd and cross-checked against the form and against each other.
"""

from __future__ import annotations
import re
from datetime import datetime, timedelta, timezone
from rapidfuzz import fuzz
from app.database.supabase_client import get_supabase
from app.utils.hashing import generate_fingerprint_hash, hash_string
from app.utils.logger import logger
from app.services.graph_service import check_onboarding_graph_risk
from app.engines.document_engine import extract_document_fields, validate_id_format, cross_check_fields
from app.engines.face_verification_engine import extract_face_embedding, compare_faces

DISPOSABLE_DOMAINS = {"mailinator.com", "10minutemail.com", "tempmail.com", "guerrillamail.com", "sharklasers.com"}

def _check_velocity(device_hash: str, ip_address: str) -> int:
    """Check how many signups happened from this device/IP in the last hour."""
    try:
        sb = get_supabase()
        one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()

        # In Supabase, we can just fetch and count
        res_device = sb.table("onboarding_attempts").select("id", count="exact").eq("device_hash", device_hash).gte("timestamp", one_hour_ago).execute()
        res_ip = sb.table("onboarding_attempts").select("id", count="exact").eq("ip_address", ip_address).gte("timestamp", one_hour_ago).execute()

        count_device = res_device.count if res_device.count is not None else len(res_device.data)
        count_ip = res_ip.count if res_ip.count is not None else len(res_ip.data)

        return max(count_device, count_ip)
    except Exception as e:
        logger.warning(f"Velocity check failed: {e}")
        return 0


def _process_id_document(
    label: str,
    image: str | None,
    id_number: str,
    id_type: str,
    name: str,
    dob: str,
    missing_penalty: int,
    reason_codes: list[str],
) -> tuple[int, dict | None]:
    """
    Shared OCR + format + cross-check pipeline for a single ID document
    (Aadhaar or PAN). Returns (score_delta, extracted_fields_or_None).
    """
    delta = 0

    if not image:
        return -missing_penalty, None

    if not validate_id_format(id_number, id_type):
        delta -= 40
        reason_codes.append(f"INVALID_{label}_FORMAT")

    fields = extract_document_fields(image, doc_type=id_type)

    if fields.get("decode_error"):
        delta -= 40
        reason_codes.append(f"{label}_IMAGE_UNREADABLE")
    elif fields.get("ocr_confidence", 0) < 0.3:
        delta -= 30
        reason_codes.append(f"LOW_{label}_OCR_CONFIDENCE")

    # Does this image actually look like the claimed document type at all —
    # not just "does it have the applicant's name on it somewhere"? Catches
    # the wrong card type, an unrelated document, or a random photo being
    # uploaded in this slot.
    if fields.get("document_type_verified") is False:
        delta -= 60
        reason_codes.append(f"WRONG_{label}_DOCUMENT_TYPE")
    elif fields.get("document_type_verified") is None and not fields.get("decode_error"):
        # Not enough OCR'd text to confirm this is genuinely the claimed
        # document type. Don't silently pass it — escalate toward manual
        # review rather than trusting an unverifiable document.
        delta -= 15
        reason_codes.append(f"UNVERIFIABLE_{label}_DOCUMENT_TYPE")

    # Does the ID number actually printed on the document match what the
    # applicant typed into the form? Prevents "type a made-up but
    # correctly-formatted number, upload any document with my name on it."
    extracted_num = fields.get("extracted_id_number", "")
    if extracted_num:
        norm_extracted = re.sub(r'[\s-]', '', extracted_num).upper()
        norm_typed = re.sub(r'[\s-]', '', id_number).upper()
        if norm_extracted != norm_typed:
            delta -= 70
            reason_codes.append(f"{label}_NUMBER_MISMATCH")

    if fields.get("extracted_name"):
        cross_check = cross_check_fields(
            form_name=name,
            form_dob=dob,
            extracted_name=fields["extracted_name"],
            extracted_dob=fields.get("extracted_dob", ""),
        )
        if not cross_check["match"]:
            delta -= 60
            reason_codes.append(f"{label}_FIELD_MISMATCH")
        if not cross_check["dob_match"] and fields.get("extracted_dob"):
            delta -= 40
            reason_codes.append(f"{label}_DOB_MISMATCH")

    return delta, fields


def evaluate_onboarding_risk(
    name: str,
    email: str,
    phone: str,
    dob: str,
    aadhaar_number: str,
    pan_number: str,
    ip_address: str,
    device_signals: dict,
    behavior_signals: dict,
    reference_image: str | None = None,
    aadhaar_image: str | None = None,
    pan_image: str | None = None,
) -> dict:
    """
    Score the onboarding attempt from 0 (High Risk) to 100 (Trusted).

    Returns
    -------
    dict with keys: risk_score, decision, reason_codes
    """
    score = 100
    reason_codes: list[str] = []

    # 1. Basic PII sanity
    email_domain = email.split("@")[-1].lower() if "@" in email else ""
    if email_domain in DISPOSABLE_DOMAINS:
        score -= 40
        reason_codes.append("DISPOSABLE_EMAIL")

    # Synthetic ID signals (mock: sequential numbers or repeating digits)
    if re.match(r"^(12345|98765|1111|0000)", aadhaar_number) or re.match(r"^(12345|98765|1111|0000)", pan_number):
        score -= 50
        reason_codes.append("SYNTHETIC_IDENTITY_SIGNAL")

    # Mismatched name/DOB pattern mock (e.g. if name contains "Test")
    if "test" in name.lower() or "demo" in name.lower():
        score -= 30
        reason_codes.append("SUSPICIOUS_NAME_PATTERN")

    # 1b. Aadhaar Card — required primary ID (photo + address proof)
    aadhaar_delta, aadhaar_fields = _process_id_document(
        "AADHAAR", aadhaar_image, aadhaar_number, "AADHAAR", name, dob, 50, reason_codes
    )
    score += aadhaar_delta
    if aadhaar_fields is None and not aadhaar_image:
        reason_codes.append("NO_AADHAAR_DOCUMENT")

    # 1c. PAN Card — required secondary ID (financial identity)
    pan_delta, pan_fields = _process_id_document(
        "PAN", pan_image, pan_number, "PAN", name, dob, 40, reason_codes
    )
    score += pan_delta
    if pan_fields is None and not pan_image:
        reason_codes.append("NO_PAN_DOCUMENT")

    # 1d. Cross-document identity consistency — does the name on the Aadhaar
    # actually match the name on the PAN? Mismatched identity documents are a
    # strong synthetic/stolen-identity signal.
    if aadhaar_fields and aadhaar_fields.get("extracted_name") and pan_fields and pan_fields.get("extracted_name"):
        name_similarity = fuzz.partial_ratio(
            aadhaar_fields["extracted_name"].lower(), pan_fields["extracted_name"].lower()
        )
        if name_similarity < 60:
            score -= 70
            reason_codes.append("IDENTITY_DOCUMENT_MISMATCH")

    # 2. Velocity Abuse
    user_agent = device_signals.get("user_agent", "")
    timezone_str = device_signals.get("timezone", "")
    screen_res = device_signals.get("screen_res", "")
    language = device_signals.get("language", "")
    platform = device_signals.get("platform", "")

    device_hash = generate_fingerprint_hash(
        user_agent, timezone_str, screen_res, language, platform
    )

    velocity = _check_velocity(device_hash, ip_address)
    if velocity >= 3:
        score -= 60
        reason_codes.append("HIGH_VELOCITY_ABUSE")
    elif velocity == 2:
        score -= 20
        reason_codes.append("ELEVATED_VELOCITY")

    # 2b. Graph Risk Checks (Cross-Time / Identity reuse) — dedupe on both IDs
    aadhaar_hash = hash_string(aadhaar_number)
    pan_hash = hash_string(pan_number)
    graph_risk = check_onboarding_graph_risk(
        device_hash=device_hash,
        ip_address=ip_address,
        phone=phone,
        aadhaar_hash=aadhaar_hash,
        pan_hash=pan_hash,
    )
    if graph_risk.get("device_reuse_count", 0) > 1 or graph_risk.get("ip_reuse_count", 0) > 2:
        score -= 70
        reason_codes.append("CROSS_TIME_DEVICE_REUSE")
    if graph_risk.get("duplicate_phone") or graph_risk.get("duplicate_aadhaar_hash") or graph_risk.get("duplicate_pan_hash"):
        score -= 80
        reason_codes.append("DUPLICATE_IDENTITY_SIGNAL")

    # 3. Behavioral Bot Signals
    typing_speed = behavior_signals.get("typing_speed_wpm", 0.0)
    mouse_event_count = behavior_signals.get("mouse_event_count", 0)
    key_hold_times = behavior_signals.get("key_hold_times", [])

    if typing_speed > 150:
        score -= 30
        reason_codes.append("BOT_SPEED_TYPING")
    elif typing_speed == 0.0 and len(key_hold_times) == 0:
        score -= 30
        reason_codes.append("PASTE_ONLY_INPUT")

    if mouse_event_count == 0:
        score -= 20
        reason_codes.append("NO_MOUSE_MOVEMENT")

    # 4. Face Verification (Reference Selfie vs. Aadhaar Photo)
    # Aadhaar is used as the photo-bearing document for the face match;
    # PAN is treated as an OCR/identity-consistency signal only.
    embedding = None
    face_match_result = None

    if not reference_image:
        score -= 100
        reason_codes.append("NO_REFERENCE_IMAGE")
    else:
        # Extract embedding for the selfie (to store in the database if accepted)
        embedding = extract_face_embedding(reference_image)
        if not embedding:
            score -= 100
            reason_codes.append("NO_FACE_DETECTED")

        # Compare selfie to Aadhaar document face
        if aadhaar_image:
            face_match = compare_faces(reference_image, aadhaar_image)
            face_match_result = face_match
            if face_match.get("error") == "IMAGE_UNREADABLE":
                # Already penalized via AADHAAR_IMAGE_UNREADABLE above; don't
                # additionally accuse the applicant of a face mismatch when the
                # comparison never actually ran.
                pass
            elif face_match.get("error") == "NO_FACE_DETECTED":
                score -= 50
                reason_codes.append("NO_FACE_ON_ID")
            elif not face_match.get("verified", False):
                score -= 80
                reason_codes.append("FACE_ID_MISMATCH")

    # Clamp score
    score = max(0, min(100, int(score)))

    # Determine decision
    if score >= 80:
        decision = "ALLOW"
    elif score >= 50:
        decision = "MANUAL_REVIEW"
    else:
        decision = "REJECT"

    return {
        "risk_score": score,
        "decision": decision,
        "reason_codes": reason_codes,
        "device_hash": device_hash,
        "aadhaar_hash": aadhaar_hash,
        "pan_hash": pan_hash,
        "embedding": embedding,
        "graph_risk": graph_risk,
        "aadhaar_extracted_fields": aadhaar_fields,
        "pan_extracted_fields": pan_fields,
        "face_match_result": face_match_result,
    }

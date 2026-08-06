"""
TrustSphere AI — Document Validation Engine
Runs OCR on uploaded ID documents and cross-checks PII with the onboarding form.
"""

import re
from rapidfuzz import fuzz
from app.utils.logger import logger
from app.utils.image_decode import decode_image_input

_easyocr_reader = None


def get_easyocr_reader():
    """
    Lazily load and cache the EasyOCR reader as a module-level singleton.
    `easyocr.Reader(...)` loads the detection + recognition model weights
    from disk on construction — several seconds of work. This used to run
    on *every single call* (every Aadhaar/PAN upload re-built the reader
    from scratch), which meant every onboarding attempt paid that cost
    twice (once per document). Cached exactly like ml_service's
    IsolationForest model load.
    """
    global _easyocr_reader
    if _easyocr_reader is not None:
        return _easyocr_reader

    try:
        import easyocr
        # Use English for now, gpu=False unless they have CUDA
        _easyocr_reader = easyocr.Reader(['en'], gpu=False, verbose=False)
        logger.info("EasyOCR reader loaded and cached")
    except Exception as e:
        logger.error(f"Failed to load easyocr: {e}")
        _easyocr_reader = None
    return _easyocr_reader


# Markers that should appear on a genuine document of each type. OCR is noisy,
# so these are matched with fuzzy tolerance (see _has_any_marker) rather than
# exact substring checks.
DOCUMENT_TYPE_MARKERS = {
    "AADHAAR": ["GOVERNMENT OF INDIA", "UNIQUE IDENTIFICATION AUTHORITY", "UIDAI", "AADHAAR"],
    "PAN": ["INCOME TAX DEPARTMENT", "PERMANENT ACCOUNT NUMBER", "GOVT OF INDIA", "INCOME TAX"],
}

# Patterns for the ID number as it's actually printed on each document type,
# used to cross-check against what the applicant typed into the form.
DOCUMENT_NUMBER_PATTERNS = {
    "AADHAAR": r'\b(\d{4}\s?\d{4}\s?\d{4})\b',
    "PAN": r'\b([A-Z]{5}\d{4}[A-Z])\b',
}


def _has_any_marker(raw_text: str, markers: list[str], threshold: int = 75) -> bool:
    """Fuzzy-check whether any expected marker phrase appears in the OCR'd text."""
    text_upper = raw_text.upper()
    return any(fuzz.partial_ratio(marker, text_upper) >= threshold for marker in markers)


def extract_document_fields(image_base64: str, doc_type: str | None = None) -> dict:
    """
    Runs OCR on the document image and attempts to parse Name, DOB, and the
    printed ID number. When `doc_type` is given ("AADHAAR" or "PAN"), also
    checks whether the document actually looks like that document type
    (expected government/authority markers) rather than assuming any image
    with the applicant's name on it is acceptable.
    """
    result = {
        "extracted_name": "",
        "extracted_dob": "",
        "extracted_id_number": "",
        "ocr_confidence": 0.0,
        "raw_text": "",
        "document_type_verified": None,  # None = not checked (no doc_type given)
    }

    if not image_base64:
        return result

    try:
        img = decode_image_input(image_base64)
        if img is None:
            result["decode_error"] = True
            logger.warning("Document OCR skipped: image/PDF could not be decoded")
            return result

        reader = get_easyocr_reader()
        if not reader:
            logger.error("EasyOCR reader not available")
            return result

        ocr_out = reader.readtext(img)

        text_lines = []
        confidences = []
        for bbox, text, conf in ocr_out:
            text_lines.append(text)
            confidences.append(conf)

        result["raw_text"] = " ".join(text_lines)
        if confidences:
            result["ocr_confidence"] = float(sum(confidences) / len(confidences))

        # Basic heuristic parsing for demo purposes
        # In a real system, you'd use a template matcher or layout LM.
        full_text = " ".join(text_lines)

        # Look for DOB (DD/MM/YYYY or similar)
        dob_match = re.search(r'\b(\d{2}[-/]\d{2}[-/]\d{4})\b', full_text)
        if dob_match:
            result["extracted_dob"] = dob_match.group(1)

        # Look for Name (simple heuristic: first line that looks like a name)
        # For simplicity in this demo, we won't extract the name directly from random text reliably.
        # But we'll try to find a capitalized 2-3 word string.
        # Alternatively, since we just fuzzy match, we can just return the raw text to cross-check.
        result["extracted_name"] = full_text  # We'll use the full text block for fuzzy matching the name

        # Extract the ID number as printed on the document (for cross-check
        # against the form-submitted number). Matched per individual OCR'd
        # line rather than against the flattened full_text blob — joining
        # every detected text box into one string risks gluing digits from
        # unrelated lines together (e.g. a DOB year run into part of the ID
        # number) since EasyOCR's detection order doesn't guarantee the
        # original top-to-bottom layout.
        if doc_type and doc_type.upper() in DOCUMENT_NUMBER_PATTERNS:
            pattern = DOCUMENT_NUMBER_PATTERNS[doc_type.upper()]
            for line in text_lines:
                num_match = re.search(pattern, line.upper())
                if num_match:
                    result["extracted_id_number"] = num_match.group(1)
                    break

        # Verify the document actually looks like the claimed type — only
        # judge this when there's enough OCR'd text to make the call fairly;
        # a near-empty raw_text is already penalized separately as low OCR
        # confidence, and shouldn't also be double-penalized as "wrong type".
        if doc_type and doc_type.upper() in DOCUMENT_TYPE_MARKERS and len(full_text.strip()) >= 15:
            result["document_type_verified"] = _has_any_marker(full_text, DOCUMENT_TYPE_MARKERS[doc_type.upper()])

    except Exception as e:
        logger.warning(f"Document OCR extraction failed: {e}")

    return result


def validate_id_format(id_number: str, id_type: str | None = None) -> bool:
    """
    Validates standard ID formats using regex.
    The onboarding form has a single generic "National ID" field (no
    explicit type selector), so when id_type isn't given we auto-detect
    it from the number's shape instead of assuming PAN.
    """
    id_number = id_number.strip().upper()

    if id_type is None:
        if re.match(r'^[A-Z]{5}\d{4}[A-Z]$', id_number):
            id_type = "PAN"
        elif re.match(r'^\d{12}$', id_number):
            id_type = "AADHAAR"
        elif re.match(r'^(?:\d{3}-\d{2}-\d{4}|\d{9})$', id_number):
            id_type = "SSN"
        else:
            id_type = "GENERIC"

    if id_type.upper() == "PAN":
        # 5 letters, 4 digits, 1 letter
        return bool(re.match(r'^[A-Z]{5}\d{4}[A-Z]$', id_number))
    elif id_type.upper() == "AADHAAR":
        # 12 digits
        return bool(re.match(r'^\d{12}$', id_number))
    elif id_type.upper() == "SSN":
        # 9 digits, with or without dashes
        return bool(re.match(r'^(?:\d{3}-\d{2}-\d{4}|\d{9})$', id_number))
    else:
        # Fallback: at least 5 alphanumeric characters
        return bool(re.match(r'^[A-Z0-9-]{5,20}$', id_number))


def cross_check_fields(form_name: str, form_dob: str, extracted_name: str, extracted_dob: str) -> dict:
    """
    Fuzzy matches the form fields against the OCR extracted fields.
    """
    # Name matching
    # Since extracted_name might contain the whole text, we use partial_ratio
    name_similarity = fuzz.partial_ratio(form_name.lower(), extracted_name.lower())
    
    # DOB matching
    # Normalize slashes and dashes
    norm_form_dob = form_dob.replace('-', '/').replace('.', '/')
    norm_ext_dob = extracted_dob.replace('-', '/').replace('.', '/')
    
    dob_match = False
    if norm_ext_dob:
        # e.g., form_dob is '1990-12-05' (YYYY-MM-DD), extract might be '05/12/1990'
        # To be safe, just see if year and month are in the extracted text
        parts = re.split(r'[-/]', norm_form_dob)
        if len(parts) == 3:
            y, m, d = parts[0], parts[1], parts[2]
            if len(y) == 4: # YYYY-MM-DD
                dob_match = (y in norm_ext_dob) and (m in norm_ext_dob)
            else:
                dob_match = (form_dob == norm_ext_dob)
    
    # If no DOB was found by OCR, we don't necessarily penalize heavily, but we flag it
    return {
        "match": name_similarity >= 70,  # 70% partial match threshold
        "name_similarity": name_similarity,
        "dob_match": dob_match
    }

"""
TrustSphere AI — Document Validation Engine
Runs OCR on uploaded ID documents and cross-checks PII with the onboarding form.
"""

import re
from rapidfuzz import fuzz
from app.utils.logger import logger
from app.utils.image_decode import decode_image_input

def get_easyocr_reader():
    """Lazy load EasyOCR reader to save memory when not needed."""
    try:
        import easyocr
        # Use English for now, gpu=False unless they have CUDA
        return easyocr.Reader(['en'], gpu=False, verbose=False)
    except Exception as e:
        logger.error(f"Failed to load easyocr: {e}")
        return None


def extract_document_fields(image_base64: str) -> dict:
    """
    Runs OCR on the document image and attempts to parse Name and DOB.
    Returns a dict with extracted fields and an overall OCR confidence.
    """
    result = {
        "extracted_name": "",
        "extracted_dob": "",
        "extracted_id_number": "",
        "ocr_confidence": 0.0,
        "raw_text": ""
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

"""
TrustSphere AI — Shared Image Decoding Helper
Decodes a base64 data URL into an OpenCV (BGR) image. Transparently
handles both raster images (JPEG/PNG/etc.) and PDF uploads (e.g. an
e-Aadhaar / e-KYC PDF) by rasterizing the first page.
"""

import base64
import numpy as np
import cv2
from app.utils.logger import logger


def decode_image_input(image_base64: str):
    """
    Decode a base64 (optionally data-URL-prefixed) payload into a cv2 BGR image.
    Returns None if the payload is empty, corrupt, or otherwise undecodable.
    """
    if not image_base64:
        return None

    try:
        b64_data = image_base64.split(",")[1] if "," in image_base64 else image_base64
        raw_bytes = base64.b64decode(b64_data)
    except Exception as e:
        logger.warning(f"Failed to base64-decode image input: {e}")
        return None

    if raw_bytes[:5] == b"%PDF-":
        return _pdf_first_page_to_cv2(raw_bytes)

    nparr = np.frombuffer(raw_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        logger.warning("cv2.imdecode returned None — unsupported/corrupt image format")
    return img


def _pdf_first_page_to_cv2(pdf_bytes: bytes):
    """Rasterize the first page of a PDF into a cv2 BGR image at ~200 DPI."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        logger.error("PyMuPDF (fitz) not installed — cannot process PDF uploads")
        return None

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        if doc.page_count == 0:
            return None
        page = doc.load_page(0)
        # Render at ~200 DPI (72 is the PDF default) for legible OCR/face detection
        matrix = fitz.Matrix(200 / 72, 200 / 72)
        pix = page.get_pixmap(matrix=matrix, alpha=False)
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        # PyMuPDF renders RGB; cv2 expects BGR
        img_bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
        doc.close()
        return img_bgr
    except Exception as e:
        logger.warning(f"Failed to rasterize PDF page for image decode: {e}")
        return None

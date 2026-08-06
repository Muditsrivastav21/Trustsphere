"""
TrustSphere AI — Face Verification Engine
Extracts embeddings and compares faces for identity verification.
"""

from app.utils.logger import logger
from app.utils.image_decode import decode_image_input

def _base64_to_cv2(b64_str: str):
    return decode_image_input(b64_str)

def extract_face_embedding(image_base64: str) -> list[float] | None:
    """
    Extracts a 512-dimensional face embedding using DeepFace (Facenet512).
    """
    try:
        from deepface import DeepFace
        img = _base64_to_cv2(image_base64)
        if img is None:
            return None
        
        # enforce_detection=True throws ValueError if no face is found
        res = DeepFace.represent(img_path=img, model_name="Facenet512", enforce_detection=True)
        if res and len(res) > 0:
            return res[0]["embedding"]
    except ValueError:
        logger.warning("Face extraction failed: no face detected in image")
    except Exception as e:
        logger.error(f"Face extraction error: {e}")
    return None

def compare_faces(image_base64_1: str, image_base64_2: str) -> dict:
    """
    Verifies if two face images belong to the same person.
    DeepFace automatically detects, crops, and compares the faces.
    """
    result = {
        "verified": False,
        "distance": 1.0,
        "error": None
    }
    
    try:
        from deepface import DeepFace
        img1 = _base64_to_cv2(image_base64_1)
        img2 = _base64_to_cv2(image_base64_2)
        
        if img1 is None or img2 is None:
            result["error"] = "IMAGE_UNREADABLE"
            return result
            
        verify_res = DeepFace.verify(
            img1_path=img1, 
            img2_path=img2, 
            model_name="Facenet512",
            enforce_detection=True
        )
        
        result["verified"] = verify_res.get("verified", False)
        result["distance"] = verify_res.get("distance", 1.0)
        
    except ValueError as e:
        logger.warning(f"Face comparison failed (face detection error): {e}")
        result["error"] = "NO_FACE_DETECTED"
    except Exception as e:
        logger.error(f"Face comparison error: {e}")
        result["error"] = "COMPARISON_ERROR"
        
    return result

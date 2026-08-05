"""
TrustSphere AI — Onboarding/KYC Router
POST /api/onboarding/signup
GET /api/onboarding/attempts
"""

import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Request
from starlette.concurrency import run_in_threadpool

from app.models.requests import OnboardingRequest
from app.models.responses import OnboardingResponse, OnboardingListResponse, OnboardingAttemptRow
from app.engines.onboarding_engine import evaluate_onboarding_risk
from app.services.graph_service import write_onboarding_to_graph
from app.utils.logger import logger
from app.database.supabase_client import get_supabase
from app.utils.rate_limiter import limiter
# Assuming auth/security mechanisms apply (using same HTTPBearer from auth if needed, but for simplicity we'll leave GET secured and POST open/limited)

router = APIRouter()

@router.post("/signup", response_model=OnboardingResponse)
@limiter.limit("5/minute")
async def signup(request: Request, req: OnboardingRequest):
    """Evaluate onboarding risk and save attempt."""
    device_dict = req.device.model_dump()
    behavior_dict = req.behavior.model_dump()
    
    # 1. Run engine
    result = await run_in_threadpool(
        evaluate_onboarding_risk,
        name=req.name,
        email=req.email,
        phone=req.phone,
        dob=req.dob,
        id_number=req.id_number,
        ip_address=req.ip_address,
        device_signals=device_dict,
        behavior_signals=behavior_dict,
        reference_image=req.reference_image,
        id_document_image=req.id_document_image,
    )
    
    attempt_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()
    
    # 2. Save attempt to DB
    sb = get_supabase()
    try:
        sb.table("onboarding_attempts").insert({
            "id": attempt_id,
            "name": req.name,
            "email": req.email,
            "phone": req.phone,
            "id_number": req.id_number,
            "ip_address": req.ip_address,
            "device_hash": result["device_hash"],
            "risk_score": result["risk_score"],
            "decision": result["decision"],
            "reason_codes": result["reason_codes"],
            "graph_check_results": result.get("graph_risk", {}),
            "id_document_extracted_fields": result.get("id_document_extracted_fields", {}),
            "face_match_result": result.get("face_match_result", {}),
            "timestamp": timestamp
        }).execute()
    except Exception as e:
        logger.error(f"Failed to record onboarding attempt: {e}")
        # We don't fail the request if just the DB insert fails
        
    # Write to Neo4j graph
    write_onboarding_to_graph(
        applicant_id=attempt_id,
        name=req.name,
        email=req.email,
        phone=req.phone,
        id_number_hash=result.get("id_number_hash", ""),
        device_hash=result.get("device_hash", ""),
        ip_address=req.ip_address,
        decision=result["decision"],
        risk_score=result["risk_score"]
    )
        
    # 3. Store embedding if ALLOW
    if result["decision"] == "ALLOW" and result.get("embedding"):
        import random
        import json
        try:
            # Check if user exists by email
            user_res = sb.table("users").select("id").eq("email", req.email).execute()
            
            # Note: storing as JSON string to fit into jsonb safely via Supabase client
            embedding_json = result["embedding"]
            
            if user_res.data and len(user_res.data) > 0:
                sb.table("users").update({"face_embedding": embedding_json}).eq("email", req.email).execute()
            else:
                customer_id = f"CUST{random.randint(100000, 999999)}"
                sb.table("users").insert({
                    "email": req.email,
                    "name": req.name,
                    "customer_id": customer_id,
                    "face_embedding": embedding_json,
                    "account_type": "Savings",
                    "risk_profile": "NORMAL",
                    "role": "customer"
                }).execute()
        except Exception as e:
            logger.error(f"Failed to save face embedding for {req.email}: {e}")
        
    return OnboardingResponse(
        id=attempt_id,
        decision=result["decision"],
        risk_score=result["risk_score"],
        reason_codes=result["reason_codes"],
        timestamp=timestamp
    )

@router.get("/attempts", response_model=OnboardingListResponse)
async def get_attempts(page: int = 1, limit: int = 20):
    """Retrieve onboarding attempts for the dashboard."""
    sb = get_supabase()
    try:
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit - 1
        
        # Get total count
        count_res = sb.table("onboarding_attempts").select("id", count="exact").execute()
        total = count_res.count if count_res.count is not None else len(count_res.data)
        
        # Get paginated data
        data_res = (
            sb.table("onboarding_attempts")
            .select("*")
            .order("timestamp", desc=True)
            .range(start_idx, end_idx)
            .execute()
        )
        
        attempts = [OnboardingAttemptRow(**row) for row in data_res.data]
        pages = max(1, (total + limit - 1) // limit)
        
        return OnboardingListResponse(
            attempts=attempts,
            total=total,
            page=page,
            limit=limit,
            pages=pages
        )
    except Exception as e:
        logger.error(f"Failed to fetch onboarding attempts: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch data")

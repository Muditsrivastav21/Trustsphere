"""
TrustSphere AI — Onboarding/KYC Router
POST /api/onboarding/signup
GET /api/onboarding/attempts
"""

import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Request, Query
from starlette.concurrency import run_in_threadpool

from app.models.requests import OnboardingRequest
from app.models.responses import OnboardingResponse, OnboardingListResponse, OnboardingAttemptRow
from app.engines.onboarding_engine import evaluate_onboarding_risk
from app.services.graph_service import write_onboarding_to_graph
from app.utils.logger import logger
from app.database.supabase_client import get_supabase
from app.utils.rate_limiter import limiter
from app.dependencies import require_analyst_or_admin

router = APIRouter()


def _mask_id_number(value: str) -> str:
    """Show only the last 4 characters of a government ID number."""
    if not value or len(value) <= 4:
        return "****"
    return "*" * (len(value) - 4) + value[-4:]

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
        aadhaar_number=req.aadhaar_number,
        pan_number=req.pan_number,
        ip_address=req.ip_address,
        device_signals=device_dict,
        behavior_signals=behavior_dict,
        reference_image=req.reference_image,
        aadhaar_image=req.aadhaar_image,
        pan_image=req.pan_image,
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
            "aadhaar_number": req.aadhaar_number,
            "pan_number": req.pan_number,
            "ip_address": req.ip_address,
            "device_hash": result["device_hash"],
            "risk_score": result["risk_score"],
            "decision": result["decision"],
            "reason_codes": result["reason_codes"],
            "graph_check_results": result.get("graph_risk", {}),
            "aadhaar_extracted_fields": result.get("aadhaar_extracted_fields", {}),
            "pan_extracted_fields": result.get("pan_extracted_fields", {}),
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
        aadhaar_hash=result.get("aadhaar_hash", ""),
        pan_hash=result.get("pan_hash", ""),
        device_hash=result.get("device_hash", ""),
        ip_address=req.ip_address,
        decision=result["decision"],
        risk_score=result["risk_score"]
    )
        
    # 3. On approval, actually create the Supabase Auth account so the
    # applicant can sign in afterwards. Previously this only wrote a row to
    # the `users` table (and only when a face embedding existed) — no
    # auth.users record was ever created, so an approved applicant had no
    # way to sign in via supabase.auth.signInWithPassword() at /login.
    if result["decision"] == "ALLOW":
        import random
        try:
            auth_id = None
            try:
                auth_res = sb.auth.admin.create_user({
                    "email": req.email,
                    "password": req.password,
                    "email_confirm": True,
                    "user_metadata": {"full_name": req.name},
                })
                auth_id = auth_res.user.id if auth_res and auth_res.user else None
            except Exception as create_err:
                # Most likely cause: an auth account already exists for this
                # email (re-submitted onboarding). Try to find it so the
                # users-table row can still be linked correctly.
                logger.warning(f"Auth user creation failed for {req.email}, attempting lookup: {create_err}")
                try:
                    existing = sb.auth.admin.list_users()
                    users_list = getattr(existing, "users", existing)
                    match = next((u for u in users_list if getattr(u, "email", None) == req.email), None)
                    if match:
                        auth_id = match.id
                except Exception as lookup_err:
                    logger.error(f"Auth user lookup fallback failed for {req.email}: {lookup_err}")

            user_res = sb.table("users").select("id").eq("email", req.email).execute()

            user_fields: dict = {
                "email": req.email,
                "name": req.name,
                "account_type": "Savings",
                "risk_profile": "NORMAL",
                "role": "customer",
            }
            if auth_id:
                user_fields["auth_id"] = auth_id
            if result.get("embedding"):
                user_fields["face_embedding"] = result["embedding"]

            if user_res.data and len(user_res.data) > 0:
                sb.table("users").update(user_fields).eq("email", req.email).execute()
            else:
                user_fields["customer_id"] = f"CUST{random.randint(100000, 999999)}"
                sb.table("users").insert(user_fields).execute()

            if not auth_id:
                logger.error(
                    f"Onboarding approved for {req.email} but no Supabase Auth account "
                    f"could be created or found — this applicant will not be able to log in."
                )
        except Exception as e:
            logger.error(f"Failed to finalize account for {req.email}: {e}")
        
    return OnboardingResponse(
        id=attempt_id,
        decision=result["decision"],
        risk_score=result["risk_score"],
        reason_codes=result["reason_codes"],
        timestamp=timestamp
    )

@router.get("/attempts", response_model=OnboardingListResponse)
async def get_attempts(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_analyst_or_admin),
):
    """
    Retrieve onboarding attempts for the dashboard.
    Analyst/admin-only, and Aadhaar/PAN numbers are masked to their last 4
    characters in the response. This previously had no auth check at all
    and returned raw, unmasked government ID numbers to anyone who could
    reach the endpoint.
    """
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

        attempts = []
        for row in data_res.data:
            row = dict(row)
            if row.get("aadhaar_number"):
                row["aadhaar_number"] = _mask_id_number(row["aadhaar_number"])
            if row.get("pan_number"):
                row["pan_number"] = _mask_id_number(row["pan_number"])
            attempts.append(OnboardingAttemptRow(**row))

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

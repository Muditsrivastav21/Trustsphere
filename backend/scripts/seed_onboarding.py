"""
TrustSphere AI — Supabase Seeder for Onboarding/KYC
Seeds the onboarding_attempts table with realistic data.
"""

import os
import sys
import uuid
import random
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.database.supabase_client import get_supabase

def seed():
    sb = get_supabase()

    events = []
    now = datetime.now(timezone.utc)

    # 5 clean signups
    for i in range(5):
        events.append({
            "id": str(uuid.uuid4()),
            "name": f"Clean User {i}",
            "email": f"clean{i}@gmail.com",
            "phone": f"+9198765432{10+i}",
            "id_number": f"ABCPQ{1000+i}X",
            "ip_address": "123.123.123.123",
            "device_hash": f"clean_device_{i}",
            "risk_score": random.randint(85, 100),
            "decision": "ALLOW",
            "reason_codes": [],
            "timestamp": (now - timedelta(hours=i)).isoformat()
        })
    
    # 3 flagged signups
    events.append({
        "id": str(uuid.uuid4()),
        "name": "Test User",
        "email": "scammer1@mailinator.com",
        "phone": "+15550000000",
        "id_number": "12345678",
        "ip_address": "45.33.32.156",
        "device_hash": "bot_device_1",
        "risk_score": 10,
        "decision": "REJECT",
        "reason_codes": ["DISPOSABLE_EMAIL", "SYNTHETIC_IDENTITY_SIGNAL", "SUSPICIOUS_NAME_PATTERN"],
        "timestamp": (now - timedelta(hours=6)).isoformat()
    })
    events.append({
        "id": str(uuid.uuid4()),
        "name": "Fast Bot",
        "email": "bot2@yahoo.com",
        "phone": "+447000000000",
        "id_number": "99999999",
        "ip_address": "185.220.101.45",
        "device_hash": "bot_device_2",
        "risk_score": 20,
        "decision": "REJECT",
        "reason_codes": ["BOT_SPEED_TYPING", "NO_MOUSE_MOVEMENT"],
        "timestamp": (now - timedelta(hours=7)).isoformat()
    })
    events.append({
        "id": str(uuid.uuid4()),
        "name": "Velocity Abuser",
        "email": "abuser@gmail.com",
        "phone": "+919999999999",
        "id_number": "XQZ999222",
        "ip_address": "103.21.244.0",
        "device_hash": "velocity_device_1",
        "risk_score": 40,
        "decision": "MANUAL_REVIEW",
        "reason_codes": ["HIGH_VELOCITY_ABUSE"],
        "timestamp": (now - timedelta(hours=8)).isoformat()
    })

    try:
        sb.table("onboarding_attempts").insert(events).execute()
        print(f"✓ Seeded {len(events)} onboarding attempts into Supabase")
    except Exception as e:
        print(f"Failed to seed: {e}\n(Did you create the onboarding_attempts table in Supabase?)")

if __name__ == "__main__":
    seed()

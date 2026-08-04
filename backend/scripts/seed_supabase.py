"""
TrustSphere AI — Supabase Seeder
Seeds the login_events table with 25 realistic historical events
so the dashboard looks populated on first load.

Run:  python scripts/seed_supabase.py
"""

import os
import sys
import random
from datetime import datetime, timedelta, timezone

# Allow running from the scripts/ directory or project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database.supabase_client import get_supabase
from app.utils.session_id import generate_session_id


def seed():
    sb = get_supabase()

    # Fetch user IDs
    users_result = sb.table("users").select("id, customer_id, name, city, email").execute()
    users = users_result.data
    if not users:
        print("ERROR: No users found. Run the SQL schema first.")
        return

    user_map = {u["customer_id"]: u for u in users}
    customer_ids = list(user_map.keys())

    # IPs to cycle through (mix of clean + flagged)
    ips = [
        ("103.21.124.8", "IN", "Lucknow", False),
        ("49.207.211.17", "IN", "Pune", False),
        ("182.74.99.10", "IN", "Mumbai", False),
        ("117.99.83.12", "IN", "Kolkata", False),
        ("27.34.119.4", "IN", "Delhi", False),
        ("59.88.201.15", "IN", "Bengaluru", False),
        ("14.139.60.22", "IN", "Chennai", False),
        ("45.33.32.156", "US", "San Jose", True),      # flagged
        ("185.220.101.45", "DE", "Berlin", True),       # TOR exit
        ("103.21.244.0", "SG", "Singapore", True),      # fraud ring
    ]

    devices = [
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/125.0",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Safari/604.1",
        "Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/125.0",
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/125.0",
        "Mozilla/5.0 (iPad; CPU OS 17_5) Safari/604.1",
    ]

    actions_map = {
        "LOW": "ALLOW",
        "MEDIUM": "OTP",
        "HIGH": "OTP",
        "CRITICAL": "BLOCK",
    }

    now = datetime.now(timezone.utc)
    events = []

    for i in range(25):
        cid = random.choice(customer_ids)
        user = user_map[cid]
        ip_info = ips[i % len(ips)]
        ip, country, city, is_flagged = ip_info

        # Vary scores
        if is_flagged:
            device_score = random.randint(20, 50)
            behavior_score = random.randint(15, 60)
            network_score = random.randint(10, 40)
        else:
            device_score = random.randint(65, 100)
            behavior_score = random.randint(60, 100)
            network_score = random.randint(55, 100)

        trust_score = int(device_score * 0.40 + behavior_score * 0.35 + network_score * 0.25)
        trust_score = max(0, min(100, trust_score))

        if trust_score >= 80:
            risk_level = "LOW"
        elif trust_score >= 60:
            risk_level = "MEDIUM"
        elif trust_score >= 40:
            risk_level = "HIGH"
        else:
            risk_level = "CRITICAL"

        auth_action = actions_map[risk_level]

        flags = []
        if is_flagged:
            flags.append("FLAGGED_IP_HIGH")
        if device_score < 65:
            flags.append("NEW_DEVICE")
        if behavior_score < 50:
            flags.append("BEHAVIORAL_ANOMALY")
        if country != "IN":
            flags.append("FOREIGN_IP")

        timestamp = (now - timedelta(hours=random.randint(0, 48), minutes=random.randint(0, 59))).isoformat()

        events.append({
            "session_id": generate_session_id(),
            "user_id": user["id"],
            "customer_id": cid,
            "user_name": user["name"],
            "timestamp": timestamp,
            "ip_address": ip,
            "country": country,
            "city": city,
            "device_hash": f"fp_seed_{i:04d}",
            "is_known_device": not is_flagged,
            "device_score": device_score,
            "behavior_score": behavior_score,
            "network_score": network_score,
            "trust_score": trust_score,
            "risk_level": risk_level,
            "auth_action": auth_action,
            "typing_speed_wpm": round(random.uniform(25, 80), 1),
            "avg_hold_time_ms": round(random.uniform(60, 130), 1),
            "mouse_speed_avg": round(random.uniform(150, 500), 1),
            "anomaly_score": round(random.uniform(-0.3, 0.3), 3),
            "flags": flags,
            "is_fraud_flagged": is_flagged,
        })

    # Insert
    sb.table("login_events").insert(events).execute()
    print(f"✓ Seeded {len(events)} login events into Supabase")

    # Also seed some graph_nodes for the fraud ring count
    try:
        sb.table("graph_nodes").upsert([
            {"neo4j_id": "ring_45_33_32_156", "node_type": "FRAUD_RING", "node_label": "Ring #A7", "risk_flag": True, "metadata": {}},
            {"neo4j_id": "ring_103_21_244_0", "node_type": "FRAUD_RING", "node_label": "Ring #B3", "risk_flag": True, "metadata": {}},
        ], on_conflict="neo4j_id").execute()
        print("✓ Seeded graph_nodes fraud ring entries")
    except Exception as e:
        print(f"  Warning: graph_nodes seed failed (non-critical): {e}")


if __name__ == "__main__":
    seed()

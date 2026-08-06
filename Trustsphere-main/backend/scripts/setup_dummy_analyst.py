import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.supabase_client import get_supabase
import random

def setup_dummy_analyst():
    sb = get_supabase()
    
    # --- SETUP dummy analyst ---
    dummy_email = "analyst@trustsphere.com"
    dummy_pass = "Analyst@123"

    print(f"\nSetting up dummy analyst: {dummy_email}")
    try:
        # Check if auth user exists
        auth_id = None
        try:
            # Try to create auth user
            res = sb.auth.admin.create_user({
                "email": dummy_email,
                "password": dummy_pass,
                "email_confirm": True
            })
            auth_id = res.user.id
            print(f"Created Auth User for {dummy_email}")
        except Exception as e:
            if "already been registered" in str(e).lower() or "already exists" in str(e).lower():
                print(f"Auth user for {dummy_email} already exists. Will try to update role in public.users.")
            else:
                print(f"Could not create auth user: {e}")

        # Now upsert in public.users
        user_res = sb.table("users").select("*").eq("email", dummy_email).execute()
        if not user_res.data:
            if not auth_id:
                auth_id = f"dummy-auth-{random.randint(1000,9999)}"
            customer_id = f"CUST{random.randint(100000, 999999)}"
            sb.table("users").insert({
                "auth_id": auth_id,
                "customer_id": customer_id,
                "name": "Dummy Analyst",
                "email": dummy_email,
                "account_type": "Admin",
                "risk_profile": "NORMAL",
                "role": "analyst",
            }).execute()
            print(f"Inserted {dummy_email} into public.users as analyst.")
        else:
            sb.table("users").update({"role": "analyst"}).eq("email", dummy_email).execute()
            print(f"Updated {dummy_email} role to analyst in public.users.")
            
        print("\n=== SUCCESS ===")
        print(f"Dummy Analyst Credentials:")
        print(f"Email: {dummy_email}")
        print(f"Password: {dummy_pass}")
        
    except Exception as e:
        print(f"Error setting up dummy analyst: {e}")

if __name__ == "__main__":
    setup_dummy_analyst()

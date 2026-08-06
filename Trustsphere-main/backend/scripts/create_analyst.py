import sys
import os

# Add backend directory to Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.supabase_client import get_supabase

def create_analyst():
    sb = get_supabase()
    email = "analyst@trustsphere.com"
    password = "Analyst@123"
    
    print(f"Checking if user {email} exists...")
    try:
        # Search public.users first
        user_res = sb.table("users").select("id, role").eq("email", email).execute()
        if user_res.data:
            print(f"User already exists in public.users: {user_res.data[0]}")
            # Ensure role is analyst
            if user_res.data[0]["role"] != "analyst":
                print("Updating role to analyst...")
                sb.table("users").update({"role": "analyst"}).eq("email", email).execute()
                print("Role updated successfully.")
            return

        # Create user in Auth using Admin API
        print("Creating user via Supabase Auth Admin API...")
        attributes = {
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"full_name": "System Analyst"}
        }
        auth_res = sb.auth.admin.create_user(attributes)
        print(f"User created successfully in Auth: ID {auth_res.user.id}")
        
        # Wait for trigger or update public.users if needed
        # The trigger should handle it, but let's double check role
        import time
        time.sleep(2)
        
        user_check = sb.table("users").select("id, role").eq("email", email).execute()
        if user_check.data:
            print(f"User verified in public.users: {user_check.data[0]}")
            if user_check.data[0]["role"] != "analyst":
                print("Trigger did not set role to analyst. Setting role manually...")
                sb.table("users").update({"role": "analyst"}).eq("email", email).execute()
                print("Role manually set to analyst.")
        else:
            print("Warning: User was not inserted into public.users. Creating entry manually...")
            sb.table("users").insert({
                "auth_id": auth_res.user.id,
                "customer_id": "CUST_ANALYST",
                "name": "System Analyst",
                "email": email,
                "account_type": "Savings",
                "role": "analyst"
            }).execute()
            print("Inserted user record manually.")
            
    except Exception as e:
        print(f"Error creating user: {e}")

if __name__ == "__main__":
    create_analyst()

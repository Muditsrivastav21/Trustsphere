import sys
import os
import time

# Add backend directory to Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.supabase_client import get_supabase

def setup_real_users():
    sb = get_supabase()
    
    users_to_create = [
        {"email": "rahul.sharma@email.com", "name": "Rahul Sharma", "customer_id": "CUST_RS1", "account_type": "Checking"},
        {"email": "priya.mehta@email.com", "name": "Priya Mehta", "customer_id": "CUST_PM1", "account_type": "Savings"},
        {"email": "arvind.kapoor@email.com", "name": "Arvind Kapoor", "customer_id": "CUST_AK1", "account_type": "Checking"},
        {"email": "sneha.iyer@email.com", "name": "Sneha Iyer", "customer_id": "CUST_SI1", "account_type": "Checking"},
        {"email": "mohammed.raza@email.com", "name": "Mohammed Raza", "customer_id": "CUST_MR1", "account_type": "Savings"},
    ]
    password = "Password@123"

    for u in users_to_create:
        email = u["email"]
        name = u["name"]
        
        print(f"Checking if user {email} exists...")
        try:
            user_res = sb.table("users").select("id, role").eq("email", email).execute()
            if user_res.data:
                print(f"User already exists in public.users: {user_res.data[0]}. Updating details...")
                sb.table("users").update({
                    "customer_id": u["customer_id"],
                    "name": name,
                    "account_type": u["account_type"],
                    "role": "customer"
                }).eq("email", email).execute()
                print("Updated existing user record.")
                continue

            print(f"Creating user {name} via Supabase Auth Admin API...")
            attributes = {
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"full_name": name}
            }
            auth_res = sb.auth.admin.create_user(attributes)
            print(f"User created successfully in Auth: ID {auth_res.user.id}")
            
            time.sleep(2)
            
            user_check = sb.table("users").select("id, role").eq("email", email).execute()
            if not user_check.data:
                print("Warning: User was not inserted into public.users. Creating entry manually...")
                sb.table("users").insert({
                    "auth_id": auth_res.user.id,
                    "customer_id": u["customer_id"],
                    "name": name,
                    "email": email,
                    "account_type": u["account_type"],
                    "role": "customer"
                }).execute()
                print("Inserted user record manually.")
            else:
                # Update with customer details if trigger only set basic info
                sb.table("users").update({
                    "customer_id": u["customer_id"],
                    "name": name,
                    "account_type": u["account_type"],
                    "role": "customer"
                }).eq("email", email).execute()
                print("Updated user record with full details.")
                
        except Exception as e:
            print(f"Error creating user {email}: {e}")

if __name__ == "__main__":
    setup_real_users()

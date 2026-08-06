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
        
        print(f"Checking if user {email} exists in Auth...")
        try:
            # Check if user exists in Auth
            users_res = sb.auth.admin.list_users()
            auth_user = next((x for x in users_res if x.email == email), None)
            
            if not auth_user:
                print(f"User {email} missing from Auth. Creating...")
                attributes = {
                    "email": email,
                    "password": password,
                    "email_confirm": True,
                    "user_metadata": {"full_name": name}
                }
                auth_res = sb.auth.admin.create_user(attributes)
                auth_id = auth_res.user.id
                print(f"Created in Auth: ID {auth_id}")
            else:
                auth_id = auth_user.id
                print(f"User already in Auth: ID {auth_id}")
            
            # Now ensure public.users is synced
            user_res = sb.table("users").select("id, role").eq("email", email).execute()
            if user_res.data:
                print(f"User exists in public.users. Updating details...")
                sb.table("users").update({
                    "customer_id": u["customer_id"],
                    "name": name,
                    "account_type": u["account_type"],
                    "role": "customer"
                }).eq("email", email).execute()
            else:
                print("Inserting into public.users...")
                sb.table("users").insert({
                    "auth_id": auth_id,
                    "customer_id": u["customer_id"],
                    "name": name,
                    "email": email,
                    "account_type": u["account_type"],
                    "role": "customer"
                }).execute()
                
        except Exception as e:
            print(f"Error creating user {email}: {e}")

if __name__ == "__main__":
    setup_real_users()

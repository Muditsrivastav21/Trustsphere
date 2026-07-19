import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.supabase_client import get_supabase

def make_analyst(email: str):
    sb = get_supabase()
    try:
        result = sb.table("users").update({"role": "analyst"}).eq("email", email).execute()
        if result.data:
            print(f"Successfully updated {email} to analyst!")
        else:
            print(f"User {email} not found or already an analyst.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    make_analyst("example@example.com")

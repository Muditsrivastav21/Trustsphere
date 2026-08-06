import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.supabase_client import get_supabase

def process():
    sb = get_supabase()
    
    # 1. Make example@example.com an analyst
    try:
        res = sb.table("users").update({"role": "analyst"}).eq("email", "example@example.com").execute()
        if res.data:
            print("Successfully made example@example.com an analyst.")
        else:
            print("example@example.com not found in public.users. Maybe it hasn't signed up yet?")
    except Exception as e:
        print(f"Error updating example@example.com: {e}")

    # 2. Find muditsrivastav22@gmail.com
    email_to_delete = "example2@example.com"
    try:
        user_res = sb.table("users").select("*").eq("email", email_to_delete).execute()
        if not user_res.data:
            print(f"User {email_to_delete} not found in public.users.")
            return
            
        user_record = user_res.data[0]
        auth_id = user_record.get("auth_id")
        customer_id = user_record.get("customer_id")
        print(f"Found user to delete: auth_id={auth_id}, customer_id={customer_id}")

        # Find the primary key
        user_pk = user_record.get("id")

        if user_pk:
            try:
                # 1. Fetch session_ids for this user
                events_res = sb.table("login_events").select("session_id").eq("user_id", user_pk).execute()
                session_ids = [e["session_id"] for e in events_res.data] if events_res.data else []
                
                # 2. Delete child records
                for sid in session_ids:
                    sb.table("behavioral_metrics").delete().eq("session_id", sid).execute()
                    sb.table("otp_sessions").delete().eq("session_id", sid).execute()
                    
                # 3. Delete login events
                sb.table("login_events").delete().eq("user_id", user_pk).execute()
            except Exception as e:
                print(f"login_events err: {e}")
            print("Deleted related login_events and behavioral_metrics.")
            
        if customer_id:
            # Note: The Neo4j graph data is separate, but we clear PostgreSQL here.
            pass

        # Delete from public.users
        sb.table("users").delete().eq("email", email_to_delete).execute()
        print(f"Deleted {email_to_delete} from public.users.")

        # Try to delete from auth.users (requires admin)
        if auth_id:
            try:
                sb.auth.admin.delete_user(auth_id)
                print("Deleted user completely from Supabase Auth.")
            except Exception as e:
                print(f"Could not automatically delete from Supabase Auth (admin method not available): {e}")

    except Exception as e:
        print(f"Error deleting user: {e}")

if __name__ == "__main__":
    process()

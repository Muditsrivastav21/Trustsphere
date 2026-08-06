import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.supabase_client import get_supabase
import json

def check_users():
    sb = get_supabase()
    result = sb.table("users").select("*").execute()
    print("Users:", json.dumps(result.data, indent=2))

if __name__ == "__main__":
    check_users()

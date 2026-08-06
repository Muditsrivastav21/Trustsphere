"""
TrustSphere AI — Supabase Client Singleton
Uses the official supabase-py library with the service role key
for full table access from the backend.
"""

from supabase import create_client, Client
from app.config.settings import settings

_client: Client | None = None

def get_supabase() -> Client:
    """Return a cached Supabase client instance."""
    global _client
    if _client is None:
        _client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_KEY,
        )
    return _client

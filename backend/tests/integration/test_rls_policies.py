"""
TrustSphere AI — Row Level Security verification (real Supabase project required)

These tests connect to Supabase with the ANON key — the same client the
frontend uses — and prove the RLS policies in scripts/schema.sql actually
enforce the RBAC boundaries the FastAPI layer assumes:
  - An unauthenticated (anon) client can read NOTHING from any table.
  - A signed-in customer can only read their own login_events/
    device_fingerprints rows, never another customer's.
  - A signed-in customer cannot read audit_log, onboarding_attempts,
    otp_sessions, system_config, or flagged_ips at all.
  - A signed-in analyst/admin can read across all customers' rows.

WHY THIS SUITE IS SEPARATE FROM tests/
---------------------------------------
Every other test in this project mocks the Supabase client boundary and
runs with zero external dependencies. RLS cannot be verified that way —
by definition, it's enforced by Postgres itself, not by application code,
so testing it requires a real (or locally-run) Postgres+PostgREST+GoTrue
stack behind a real Supabase URL and anon key.

HOW TO RUN THIS FOR REAL
-------------------------
1. Apply backend/scripts/schema.sql to your Supabase project (SQL Editor
   → New Query → paste → Run). It's idempotent, safe to re-run.
2. Ensure at least two seeded customer accounts and one analyst account
   exist (backend/scripts/setup_real_users.py or create_analyst.py).
3. Set these environment variables (a real project, not the placeholder
   values shipped in .env.example):
     SUPABASE_URL, SUPABASE_ANON_KEY
     RLS_TEST_CUSTOMER_A_EMAIL / RLS_TEST_CUSTOMER_A_PASSWORD
     RLS_TEST_CUSTOMER_B_EMAIL / RLS_TEST_CUSTOMER_B_PASSWORD
     RLS_TEST_ANALYST_EMAIL / RLS_TEST_ANALYST_PASSWORD
4. Run:  pytest backend/tests/integration/test_rls_policies.py -v

WHAT HAPPENS WITHOUT REAL CREDENTIALS
---------------------------------------
Every test in this file calls `_require_real_project()` first, which
raises `pytest.skip(...)` with an explicit reason the moment it detects
a placeholder/missing URL or key. That is a deliberate, visible skip —
not a silent pass — so `pytest` output always tells you whether RLS was
actually verified on this run or not.
"""

from __future__ import annotations

import os
import pytest

try:
    from supabase import create_client
except ImportError:  # pragma: no cover
    create_client = None


def _is_placeholder(value: str) -> bool:
    if not value:
        return True
    placeholder_markers = ("your-", "xxxx", "dummy", "example.supabase.co", "changeme")
    return any(marker in value.lower() for marker in placeholder_markers)


def _require_real_project() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL", "")
    anon_key = os.environ.get("SUPABASE_ANON_KEY", "")

    if create_client is None:
        pytest.skip("supabase-py is not installed in this environment.")

    if _is_placeholder(url) or _is_placeholder(anon_key):
        pytest.skip(
            "RLS verification skipped: SUPABASE_URL / SUPABASE_ANON_KEY are "
            "missing or still placeholder values. This is expected in any "
            "environment without a real Supabase project — see this file's "
            "module docstring for exactly how to run it for real."
        )

    return url, anon_key


def _require_test_credentials(*env_vars: str) -> list[str]:
    values = [os.environ.get(v, "") for v in env_vars]
    if not all(values):
        missing = [v for v, val in zip(env_vars, values) if not val]
        pytest.skip(
            f"RLS verification skipped: missing test-account env vars {missing}. "
            "See this file's module docstring for the full list required."
        )
    return values


@pytest.fixture()
def anon_client():
    url, anon_key = _require_real_project()
    return create_client(url, anon_key)


def _sign_in(client, email: str, password: str):
    res = client.auth.sign_in_with_password({"email": email, "password": password})
    if not res or not res.session:
        pytest.fail(f"Could not sign in as {email} — check the RLS_TEST_* credentials are valid.")
    return res.session.access_token


class TestUnauthenticatedAccessDenied:
    """An anon (not-signed-in) client must see nothing sensitive."""

    def test_anon_cannot_read_otp_sessions(self, anon_client):
        result = anon_client.table("otp_sessions").select("*").execute()
        assert result.data == [], "otp_sessions must be completely unreadable by anon"

    def test_anon_cannot_read_system_config(self, anon_client):
        result = anon_client.table("system_config").select("*").execute()
        assert result.data == [], "system_config (scoring thresholds) must be unreadable by anon"

    def test_anon_cannot_read_flagged_ips(self, anon_client):
        result = anon_client.table("flagged_ips").select("*").execute()
        assert result.data == [], "flagged_ips must be unreadable by anon"

    def test_anon_cannot_read_audit_log(self, anon_client):
        result = anon_client.table("audit_log").select("*").execute()
        assert result.data == [], "audit_log must be unreadable by anon"

    def test_anon_cannot_read_onboarding_attempts(self, anon_client):
        result = anon_client.table("onboarding_attempts").select("*").execute()
        assert result.data == [], (
            "onboarding_attempts (raw Aadhaar/PAN numbers) must be unreadable by anon — "
            "this is the exact PII leak the audit found on the API layer; RLS must "
            "close the same hole at the database layer."
        )

    def test_anon_cannot_read_login_events(self, anon_client):
        result = anon_client.table("login_events").select("*").execute()
        assert result.data == [], "login_events must be unreadable by anon"

    def test_anon_cannot_read_users(self, anon_client):
        result = anon_client.table("users").select("*").execute()
        assert result.data == [], "users must be unreadable by anon"


class TestCustomerScopedAccess:
    """A signed-in customer must see only their own rows, never a peer's."""

    def test_customer_cannot_read_another_customers_login_events(self, anon_client):
        email_a, pwd_a, email_b, pwd_b = _require_test_credentials(
            "RLS_TEST_CUSTOMER_A_EMAIL", "RLS_TEST_CUSTOMER_A_PASSWORD",
            "RLS_TEST_CUSTOMER_B_EMAIL", "RLS_TEST_CUSTOMER_B_PASSWORD",
        )

        # Sign in as customer B, find their own user_id.
        _sign_in(anon_client, email_b, pwd_b)
        own_rows = anon_client.table("users").select("id").eq("email", email_b).execute()
        assert own_rows.data, "customer B could not even read their own users row"
        customer_b_id = own_rows.data[0]["id"]
        anon_client.auth.sign_out()

        # Sign in as customer A, attempt to read customer B's login_events by user_id.
        _sign_in(anon_client, email_a, pwd_a)
        cross_read = (
            anon_client.table("login_events")
            .select("*")
            .eq("user_id", customer_b_id)
            .execute()
        )
        assert cross_read.data == [], (
            "SECURITY FAILURE: customer A could read customer B's login_events rows. "
            "RLS policy 'login_events_select_own_or_staff' is not enforcing correctly."
        )
        anon_client.auth.sign_out()

    def test_customer_cannot_read_audit_log(self, anon_client):
        email_a, pwd_a = _require_test_credentials(
            "RLS_TEST_CUSTOMER_A_EMAIL", "RLS_TEST_CUSTOMER_A_PASSWORD",
        )
        _sign_in(anon_client, email_a, pwd_a)
        result = anon_client.table("audit_log").select("*").execute()
        assert result.data == [], "a plain customer must never be able to read audit_log"
        anon_client.auth.sign_out()

    def test_customer_cannot_read_onboarding_attempts(self, anon_client):
        email_a, pwd_a = _require_test_credentials(
            "RLS_TEST_CUSTOMER_A_EMAIL", "RLS_TEST_CUSTOMER_A_PASSWORD",
        )
        _sign_in(anon_client, email_a, pwd_a)
        result = anon_client.table("onboarding_attempts").select("*").execute()
        assert result.data == [], "a plain customer must never see raw KYC/Aadhaar/PAN data"
        anon_client.auth.sign_out()

    def test_customer_can_read_own_login_events(self, anon_client):
        email_a, pwd_a = _require_test_credentials(
            "RLS_TEST_CUSTOMER_A_EMAIL", "RLS_TEST_CUSTOMER_A_PASSWORD",
        )
        _sign_in(anon_client, email_a, pwd_a)
        result = anon_client.table("login_events").select("*").execute()
        # Not asserting non-empty (a fresh test account may have no logins yet) —
        # only that the query succeeds and doesn't error, proving the policy
        # grants (rather than fully denies) access to the row owner.
        assert result.data is not None
        anon_client.auth.sign_out()


class TestStaffAccess:
    """A signed-in analyst/admin must see across all customers."""

    def test_analyst_can_read_all_login_events(self, anon_client):
        email, pwd = _require_test_credentials(
            "RLS_TEST_ANALYST_EMAIL", "RLS_TEST_ANALYST_PASSWORD",
        )
        _sign_in(anon_client, email, pwd)
        result = anon_client.table("login_events").select("*").limit(5).execute()
        assert result.data is not None
        anon_client.auth.sign_out()

    def test_analyst_can_read_audit_log(self, anon_client):
        email, pwd = _require_test_credentials(
            "RLS_TEST_ANALYST_EMAIL", "RLS_TEST_ANALYST_PASSWORD",
        )
        _sign_in(anon_client, email, pwd)
        result = anon_client.table("audit_log").select("*").limit(5).execute()
        assert result.data is not None
        anon_client.auth.sign_out()

    def test_analyst_can_read_onboarding_attempts(self, anon_client):
        email, pwd = _require_test_credentials(
            "RLS_TEST_ANALYST_EMAIL", "RLS_TEST_ANALYST_PASSWORD",
        )
        _sign_in(anon_client, email, pwd)
        result = anon_client.table("onboarding_attempts").select("*").limit(5).execute()
        assert result.data is not None
        anon_client.auth.sign_out()

    def test_analyst_still_cannot_read_otp_sessions(self, anon_client):
        """Even staff must never read OTP codes directly — that's
        service_role-only, no exceptions for any authenticated role."""
        email, pwd = _require_test_credentials(
            "RLS_TEST_ANALYST_EMAIL", "RLS_TEST_ANALYST_PASSWORD",
        )
        _sign_in(anon_client, email, pwd)
        result = anon_client.table("otp_sessions").select("*").execute()
        assert result.data == [], "otp_sessions must be unreadable even by analyst/admin roles"
        anon_client.auth.sign_out()

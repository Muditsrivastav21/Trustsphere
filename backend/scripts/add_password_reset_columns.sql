-- TrustSphere AI — adds the columns needed for the account-recovery
-- password-reset flow (POST /api/recovery/reset-password).
-- Run this once in: Supabase Dashboard → SQL Editor → New Query → Run.

-- Tracks when a user's password was last changed via the recovery flow.
-- Used as a fallback session-invalidation mechanism: supabase-py's admin
-- API (gotrue 2.12.3, confirmed by reading the installed source) has no
-- "revoke all sessions for this user_id" method — only sign_out(jwt, scope),
-- which needs a specific token, not a user_id. So instead, get_current_user()
-- rejects any JWT whose `iat` (issued-at) claim predates this timestamp.
alter table public.users
  add column if not exists password_changed_at timestamptz;

-- otp_sessions gains two columns to support the reset-password endpoint:
--   verified_at        — set when OTP verification succeeds (both the login
--                         and recovery flows share verify_otp()). Used to
--                         enforce a 10-minute window between "OTP verified"
--                         and "password actually reset", so a long-since-
--                         verified session can't be replayed hours later.
--   password_reset_at   — set once the password has actually been reset via
--                         this session. Its presence is the "already
--                         consumed" guard — a verified OTP session can only
--                         be used to reset a password once.
alter table public.otp_sessions
  add column if not exists verified_at timestamptz,
  add column if not exists password_reset_at timestamptz;

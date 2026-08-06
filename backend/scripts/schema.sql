-- =====================================================================
-- TrustSphere AI — Canonical Database Schema + Row Level Security
-- =====================================================================
-- Run this ONCE against a fresh Supabase project:
--   Supabase Dashboard → SQL Editor → New Query → paste this file → Run
-- Or via the Supabase CLI:
--   supabase db execute --file backend/scripts/schema.sql
--
-- This file is idempotent (safe to re-run) and is the single source of
-- truth for every table the backend touches. Before this file existed,
-- the schema was assembled ad-hoc through the Supabase dashboard UI with
-- no version-controlled record of it except two small incremental patch
-- files (add_password_reset_columns.sql, create_onboarding_attempts_table.sql,
-- both still applied here for idempotency/compatibility with an
-- already-provisioned project).
--
-- SECURITY MODEL
-- ---------------
-- The backend authenticates to Supabase with the SERVICE ROLE key
-- (see app/database/supabase_client.py), which bypasses Row Level
-- Security entirely — that's what lets the API layer enforce its own
-- RBAC (customer / analyst / admin) in Python.
--
-- RLS in this file exists for DEFENSE IN DEPTH against anything that
-- talks to Supabase directly with the ANON key — which the frontend
-- does for two things: Supabase Auth session management, and a
-- Realtime `postgres_changes` subscription on login_events (see
-- frontend/src/routes/dashboard.tsx). Without RLS, that anon-key path
-- would bypass every RBAC check the FastAPI layer enforces and expose
-- raw PII (Aadhaar/PAN numbers, other customers' IPs/trust scores)
-- directly to any authenticated browser session.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. users
-- ---------------------------------------------------------------------
create table if not exists public.users (
  id                  uuid primary key default gen_random_uuid(),
  auth_id             uuid unique,                    -- links to auth.users.id
  customer_id         text unique not null,
  name                text not null default 'New User',
  email               text not null default '',
  city                text default '',
  account_type        text default 'Savings',
  risk_profile        text default 'NORMAL',          -- NORMAL | FROZEN
  role                text not null default 'customer', -- customer | analyst | admin
  home_country        text,
  home_timezone       text,
  password_changed_at timestamptz,
  face_embedding      jsonb,
  security_rules      jsonb default '{}'::jsonb,
  created_at          timestamptz default now()
);

create index if not exists users_auth_id_idx on public.users (auth_id);
create index if not exists users_customer_id_idx on public.users (customer_id);
create index if not exists users_email_idx on public.users (email);

-- Idempotent column adds, in case this runs against a project that
-- already has an older version of the table.
alter table public.users add column if not exists password_changed_at timestamptz;
alter table public.users add column if not exists face_embedding jsonb;
alter table public.users add column if not exists security_rules jsonb default '{}'::jsonb;
alter table public.users add column if not exists home_country text;
alter table public.users add column if not exists home_timezone text;

-- ---------------------------------------------------------------------
-- 2. login_events
-- ---------------------------------------------------------------------
create table if not exists public.login_events (
  id                 uuid primary key default gen_random_uuid(),
  session_id         text unique not null,
  user_id            uuid references public.users(id) on delete set null,
  customer_id        text,
  user_name          text,
  "timestamp"        timestamptz default now(),
  ip_address         text,
  country            text,
  city               text,
  device_hash        text,
  is_known_device    boolean default false,
  device_score       int,
  behavior_score     int,
  network_score      int,
  trust_score        int,
  risk_level         text,        -- LOW | MEDIUM | HIGH | CRITICAL
  auth_action        text,        -- ALLOW | OTP | BLOCK | RECOVERY_*
  typing_speed_wpm   numeric,
  avg_hold_time_ms   numeric,
  mouse_speed_avg    numeric,
  anomaly_score      numeric,
  flags              jsonb default '[]'::jsonb,
  is_fraud_flagged   boolean default false,
  metadata           jsonb default '{}'::jsonb
);

create index if not exists login_events_user_id_idx on public.login_events (user_id);
create index if not exists login_events_session_id_idx on public.login_events (session_id);
create index if not exists login_events_timestamp_idx on public.login_events ("timestamp" desc);
create index if not exists login_events_device_hash_idx on public.login_events (device_hash);
create index if not exists login_events_ip_address_idx on public.login_events (ip_address);
create index if not exists login_events_auth_action_idx on public.login_events (auth_action);

-- ---------------------------------------------------------------------
-- 3. behavioral_metrics
-- ---------------------------------------------------------------------
create table if not exists public.behavioral_metrics (
  id                 uuid primary key default gen_random_uuid(),
  session_id         text not null,
  key_hold_times     jsonb default '[]'::jsonb,
  flight_times       jsonb default '[]'::jsonb,
  typing_speed_wpm   numeric,
  mouse_speeds       jsonb default '[]'::jsonb,
  mouse_event_count  int,
  total_keystrokes   int,
  anomaly_score      numeric,
  is_anomalous       boolean default false,
  created_at         timestamptz default now()
);

create index if not exists behavioral_metrics_session_id_idx on public.behavioral_metrics (session_id);

-- ---------------------------------------------------------------------
-- 4. device_fingerprints
-- ---------------------------------------------------------------------
create table if not exists public.device_fingerprints (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references public.users(id) on delete cascade,
  fingerprint_hash   text not null,
  user_agent         text,
  timezone           text,
  screen_res         text,
  language           text,
  platform           text,
  color_depth        int default 24,
  trust_level        text default 'NEW',  -- NEW | KNOWN | TRUSTED | REVOKED
  first_seen         timestamptz default now(),
  last_seen          timestamptz default now(),
  login_count        int default 1,
  unique (user_id, fingerprint_hash)
);

create index if not exists device_fingerprints_user_id_idx on public.device_fingerprints (user_id);

-- ---------------------------------------------------------------------
-- 5. audit_log (immutable — insert-only from the backend's perspective)
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  event_type   text not null,
  description  text,
  metadata     jsonb default '{}'::jsonb,
  created_at   timestamptz default now()
);

create index if not exists audit_log_event_type_idx on public.audit_log (event_type);
create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);

-- ---------------------------------------------------------------------
-- 6. otp_sessions — the most sensitive table in the schema; no client
--    (anon or authenticated) should ever be able to read or write it.
-- ---------------------------------------------------------------------
create table if not exists public.otp_sessions (
  session_id          text primary key,
  otp_code            text not null,
  used                boolean default false,
  expires_at          timestamptz not null,
  verified_at         timestamptz,
  password_reset_at   timestamptz,
  created_at          timestamptz default now()
);

alter table public.otp_sessions add column if not exists verified_at timestamptz;
alter table public.otp_sessions add column if not exists password_reset_at timestamptz;

-- ---------------------------------------------------------------------
-- 7. system_config — scoring weights/thresholds. Backend-managed only.
-- ---------------------------------------------------------------------
create table if not exists public.system_config (
  key    text primary key,
  value  text not null
);

insert into public.system_config (key, value) values
  ('weight_device',    '0.40'),
  ('weight_behavior',  '0.35'),
  ('weight_network',   '0.25'),
  ('threshold_allow',  '80'),
  ('threshold_otp',    '68'),
  ('threshold_block',  '56')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 8. flagged_ips
-- ---------------------------------------------------------------------
create table if not exists public.flagged_ips (
  id           uuid primary key default gen_random_uuid(),
  ip_address   text unique not null,
  severity     text default 'HIGH',  -- HIGH | CRITICAL
  reason       text,
  created_at   timestamptz default now()
);

create index if not exists flagged_ips_ip_address_idx on public.flagged_ips (ip_address);

-- ---------------------------------------------------------------------
-- 9. onboarding_attempts (already had its own migration file; repeated
--    here idempotently so this one file is a complete standalone schema)
-- ---------------------------------------------------------------------
create table if not exists public.onboarding_attempts (
  id                        uuid primary key,
  name                      text,
  email                     text,
  phone                     text,
  aadhaar_number            text,
  pan_number                text,
  ip_address                text,
  device_hash               text,
  risk_score                int,
  decision                  text,
  reason_codes              jsonb default '[]'::jsonb,
  graph_check_results       jsonb default '{}'::jsonb,
  aadhaar_extracted_fields  jsonb default '{}'::jsonb,
  pan_extracted_fields      jsonb default '{}'::jsonb,
  face_match_result         jsonb default '{}'::jsonb,
  "timestamp"               timestamptz default now()
);

create index if not exists onboarding_attempts_device_hash_idx on public.onboarding_attempts (device_hash);
create index if not exists onboarding_attempts_ip_address_idx on public.onboarding_attempts (ip_address);
create index if not exists onboarding_attempts_timestamp_idx on public.onboarding_attempts ("timestamp" desc);

-- ---------------------------------------------------------------------
-- 10. graph_nodes — lightweight Postgres mirror of fraud-ring counts
--     used as a fallback when Neo4j itself isn't queried directly.
-- ---------------------------------------------------------------------
create table if not exists public.graph_nodes (
  id           uuid primary key default gen_random_uuid(),
  neo4j_id     text unique,
  node_type    text,   -- USER | DEVICE | IP | EMAIL | FRAUD_RING | APPLICANT
  node_label   text,
  risk_flag    boolean default false,
  metadata     jsonb default '{}'::jsonb,
  created_at   timestamptz default now()
);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================

-- Helper: look up the calling user's role without recursive-RLS issues.
-- SECURITY DEFINER means this function runs with the privileges of its
-- owner (bypassing RLS for this one lookup), which is the standard,
-- Supabase-documented way to reference a table's own role column from
-- inside that same table's RLS policy without infinite recursion.
create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.users where auth_id = auth.uid();
$$;

-- Helper: the calling user's internal users.id (used to scope
-- login_events/device_fingerprints/behavioral_metrics rows to "my own").
create or replace function public.current_user_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.users where auth_id = auth.uid();
$$;

-- --- users ---
alter table public.users enable row level security;

drop policy if exists "users_select_own_or_staff" on public.users;
create policy "users_select_own_or_staff"
  on public.users for select
  using (
    auth_id = auth.uid()
    or public.current_user_role() in ('analyst', 'admin')
  );

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
  on public.users for update
  using (auth_id = auth.uid())
  with check (auth_id = auth.uid());
-- No insert/delete policy for anon/authenticated — account creation and
-- role changes are backend-only (service_role), which bypasses RLS.

-- --- login_events ---
alter table public.login_events enable row level security;

drop policy if exists "login_events_select_own_or_staff" on public.login_events;
create policy "login_events_select_own_or_staff"
  on public.login_events for select
  using (
    user_id = public.current_user_id()
    or public.current_user_role() in ('analyst', 'admin')
  );
-- No client insert/update/delete — the backend writes these via
-- service_role only.

-- --- behavioral_metrics ---
alter table public.behavioral_metrics enable row level security;

drop policy if exists "behavioral_metrics_select_own_or_staff" on public.behavioral_metrics;
create policy "behavioral_metrics_select_own_or_staff"
  on public.behavioral_metrics for select
  using (
    session_id in (
      select session_id from public.login_events
      where user_id = public.current_user_id()
    )
    or public.current_user_role() in ('analyst', 'admin')
  );

-- --- device_fingerprints ---
alter table public.device_fingerprints enable row level security;

drop policy if exists "device_fingerprints_select_own_or_staff" on public.device_fingerprints;
create policy "device_fingerprints_select_own_or_staff"
  on public.device_fingerprints for select
  using (
    user_id = public.current_user_id()
    or public.current_user_role() in ('analyst', 'admin')
  );
-- Customers ARE allowed to revoke their own devices via the backend's
-- /api/sessions/devices/{id}/revoke endpoint, but that write goes
-- through service_role, not the client directly — so no client-side
-- update/delete policy is granted here either.

-- --- audit_log — analyst/admin only, no customer access ---
alter table public.audit_log enable row level security;

drop policy if exists "audit_log_select_staff_only" on public.audit_log;
create policy "audit_log_select_staff_only"
  on public.audit_log for select
  using (public.current_user_role() in ('analyst', 'admin'));

-- --- onboarding_attempts — analyst/admin only ---
alter table public.onboarding_attempts enable row level security;

drop policy if exists "onboarding_attempts_select_staff_only" on public.onboarding_attempts;
create policy "onboarding_attempts_select_staff_only"
  on public.onboarding_attempts for select
  using (public.current_user_role() in ('analyst', 'admin'));

-- --- graph_nodes — analyst/admin only ---
alter table public.graph_nodes enable row level security;

drop policy if exists "graph_nodes_select_staff_only" on public.graph_nodes;
create policy "graph_nodes_select_staff_only"
  on public.graph_nodes for select
  using (public.current_user_role() in ('analyst', 'admin'));

-- --- otp_sessions, system_config, flagged_ips — RLS enabled, ZERO
-- policies granted to anon/authenticated. service_role (the backend)
-- bypasses RLS automatically and is the only thing that ever touches
-- these tables. This is a deliberate deny-all: OTP codes, scoring
-- thresholds, and the flagged-IP list must never be client-readable.
alter table public.otp_sessions enable row level security;
alter table public.system_config enable row level security;
alter table public.flagged_ips enable row level security;

-- =====================================================================
-- REALTIME
-- =====================================================================
-- The frontend subscribes to `postgres_changes` INSERT events on
-- login_events (dashboard.tsx) to toast "high-risk login detected".
-- Supabase Realtime enforces the SELECT RLS policy above per-subscriber,
-- so with the policy in place a customer's subscription will only ever
-- receive their own rows, and analysts/admins receive all rows — this
-- table must stay in the supabase_realtime publication for that toast
-- to keep working, which it does by default on most projects. If it's
-- ever missing, add it with:
--   alter publication supabase_realtime add table public.login_events;
-- =====================================================================

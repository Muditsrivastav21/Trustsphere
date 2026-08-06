-- TrustSphere AI — creates the onboarding_attempts table used by
-- POST /api/onboarding/signup and GET /api/onboarding/attempts.
-- Run this once in: Supabase Dashboard → SQL Editor → New Query → Run.

create table if not exists public.onboarding_attempts (
  id uuid primary key,
  name text,
  email text,
  phone text,
  aadhaar_number text,
  pan_number text,
  ip_address text,
  device_hash text,
  risk_score int,
  decision text,
  reason_codes jsonb default '[]'::jsonb,
  graph_check_results jsonb default '{}'::jsonb,
  aadhaar_extracted_fields jsonb default '{}'::jsonb,
  pan_extracted_fields jsonb default '{}'::jsonb,
  face_match_result jsonb default '{}'::jsonb,
  "timestamp" timestamptz default now()
);

-- Speed up the velocity-abuse check (recent attempts by device/IP) and the
-- analyst dashboard's newest-first listing.
create index if not exists onboarding_attempts_device_hash_idx on public.onboarding_attempts (device_hash);
create index if not exists onboarding_attempts_ip_address_idx on public.onboarding_attempts (ip_address);
create index if not exists onboarding_attempts_timestamp_idx on public.onboarding_attempts ("timestamp" desc);

-- Row Level Security: deny all access by default. The backend talks to
-- Supabase using the service_role key, which bypasses RLS automatically,
-- so no policy is needed for the app to keep working — this just makes
-- sure nothing else (e.g. the anon key used by the frontend) can read
-- applicant PII (Aadhaar/PAN numbers, face match results) directly.
alter table public.onboarding_attempts enable row level security;

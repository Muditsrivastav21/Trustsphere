# Integration Tests — Running Against Real Infrastructure

Everything in `backend/tests/*.py` (outside this folder) is a **unit
test**: it mocks the Supabase/Neo4j client boundary and runs with zero
external dependencies, in well under a second. That's intentional —
unit tests should never need a network.

Everything in **this** folder is the opposite on purpose: a real
integration test that talks to a real backing service. Each file skips
itself, loudly and individually, with an explicit reason, if that
service isn't reachable — it never silently reports "passed" for
something it didn't actually check. Run `pytest tests/integration/ -v`
at any time to see exactly what was verified for real vs. skipped on
this machine.

## 1. Neo4j — one Docker command, no cloud account needed

```bash
docker compose -f docker-compose.test.yml up -d
cd backend
NEO4J_URI=bolt://localhost:7687 NEO4J_USERNAME=neo4j NEO4J_PASSWORD=testpassword123 \
  ./venv/Scripts/python.exe -m pytest tests/integration/test_neo4j_integration.py -v
docker compose -f docker-compose.test.yml down -v
```

If you don't set those three env vars at all, the test file tries
`bolt://localhost:7687` / `neo4j` / `testpassword123` automatically —
the exact same defaults the `docker-compose.test.yml` service uses — so
in practice you can usually just run the `pytest` line with no env vars
once the container is up.

To point this at your real Neo4j AuraDB project instead of a local
container, set the three env vars to your actual `NEO4J_URI` /
`NEO4J_USERNAME` / `NEO4J_PASSWORD` from `backend/.env`.

## 2. Supabase (Postgres + Auth + RLS) — via the Supabase CLI

RLS is a *Postgres* feature — enforced by the database engine itself
against a specific set of roles (`anon`, `authenticated`, `service_role`)
that Supabase's Auth layer (GoTrue) issues JWTs for. A plain Postgres
container can't reproduce that; you need the actual Supabase stack. The
Supabase CLI ships exactly that as a one-command local Docker stack —
this is the officially supported way to get "a live Supabase instance"
without a cloud project:

```bash
# One-time install (see https://supabase.com/docs/guides/cli for other platforms)
npm install -g supabase

# From the repo root:
supabase init          # only needed once, creates supabase/config.toml
supabase start          # pulls + starts Postgres, GoTrue, PostgREST, Studio, etc.
```

`supabase start` prints a local API URL, anon key, and service role key
— use the **anon key** it prints for the env vars below (not the
service role key; the whole point of these tests is verifying what the
anon-key-scoped client can and can't see).

```bash
# Apply the schema + RLS policies to the local stack:
supabase db execute --file backend/scripts/schema.sql

# Create the three test accounts the RLS suite needs (customer A, customer
# B, and one analyst) — either through Supabase Studio's Auth UI at the
# URL supabase start printed, or by adapting backend/scripts/create_analyst.py.

# Run the suite:
cd backend
SUPABASE_URL=<url from supabase start> \
SUPABASE_ANON_KEY=<anon key from supabase start> \
RLS_TEST_CUSTOMER_A_EMAIL=... RLS_TEST_CUSTOMER_A_PASSWORD=... \
RLS_TEST_CUSTOMER_B_EMAIL=... RLS_TEST_CUSTOMER_B_PASSWORD=... \
RLS_TEST_ANALYST_EMAIL=...    RLS_TEST_ANALYST_PASSWORD=... \
  ./venv/Scripts/python.exe -m pytest tests/integration/test_rls_policies.py -v

supabase stop
```

Everything above works identically against your real cloud Supabase
project — just point `SUPABASE_URL` / `SUPABASE_ANON_KEY` at it instead
of the local stack's values, after applying `schema.sql` there too.

## Why this couldn't be run automatically as part of this change

Both of the above need either a Docker daemon with a running Linux VM
backend, or `npm install -g supabase` reaching the internet — neither
was available in the sandboxed session that produced this change (no
GUI/service-elevation for Docker Desktop; see the commit history for the
exact error). The test files, `docker-compose.test.yml`, and this
walkthrough are written and verified to *collect and skip cleanly* with
zero infrastructure — the moment you run the two commands above in a
normal dev machine, they run for real.

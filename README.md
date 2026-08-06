<div align="center">
  
# TrustSphere AI
### Real-Time Identity Trust & Adaptive Authentication Platform



[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.io/)
[![Neo4j](https://img.shields.io/badge/Neo4j-008CC1?style=for-the-badge&logo=neo4j&logoColor=white)](https://neo4j.com/)

<br />

*Built for the Bank of Baroda Hackathon 2026*

</div>

---

## Overview

**TrustSphere AI** is an advanced, real-time fraud detection and identity trust evaluation platform. Instead of relying solely on passwords, TrustSphere analyzes device fingerprints, behavioral biometrics (typing speed, mouse movements), and network signals continuously in the background to calculate a unified **Trust Score**.

Based on this score, the system dynamically:
- **Allows** low-risk logins seamlessly.
- **Requires step-up authentication (OTP)** for medium-risk or unrecognized devices.
- **Blocks** high-risk access attempts associated with known fraud rings.

---

## System Architecture

![Architecture Diagram](./Architecture_Diagram.png)

To ensure enterprise-grade scalability and sub-80ms decision latency, TrustSphere utilizes an asynchronous workflow. Heavy graph traversals (Neo4j) are decoupled from the main authentication flow using background task queues, and trusted devices are cached in-memory.

---

## Data Flow Workflow

![Data Flow Diagram](./Data_Flow_Diagram.png)

---

## Key Features

- **Real-Time Trust Evaluation**: Instantly calculates a Trust Score (0-100) using a weighted combination of Device, Behavior, and Network signals.
- **Behavioral Biometrics Engine**: Uses Scikit-Learn (IsolationForest) to analyze keystroke dynamics and mouse speeds to detect bots or account takeovers.
- **Device Fingerprinting**: Generates and tracks unique device hashes (Canvas, WebGL, Audio) to identify known vs. unknown devices.
- **Network Intelligence**: Evaluates IP risk and prevents credential stuffing via strict Rate Limiting.
- **Fraud Graph Detection**: Leverages Neo4j to map complex relationships (IPs shared by multiple accounts) to flag organized fraud rings.
- **KYC Onboarding Risk Engine (Aadhaar + PAN)**: A two-document Indian KYC flow — applicants upload both an Aadhaar card and a PAN card (image or PDF). Each document is OCR'd and independently:
  - **Format-validated** against the correct ID pattern (12-digit Aadhaar vs. 5-letter/4-digit/1-letter PAN — no longer assumes PAN for everything).
  - **Type-verified** — checks the OCR'd text for document-specific markers (UIDAI/Aadhaar vs. Income Tax Department/PAN) so a wrong document, or an unrelated photo, can't be uploaded in place of the real one.
  - **Cross-checked** against the form (name, DOB) and against the *other* document (does the name on the Aadhaar match the name on the PAN), plus the ID number actually printed on the document is compared against what was typed.
  - **Face-matched** — the live selfie is compared against the Aadhaar photo via DeepFace (Facenet512).
  - Backed by velocity-abuse and cross-time device/IP/phone/ID-hash reuse checks via the fraud graph, so repeat or synthetic-identity signups are caught even across separate attempts.
- **Privileged Access Management (Insider Threat)**: Monitors admin and analyst accounts for off-hours access or excessive data extraction.
- **Identity Compromise Detection**: Continuous mid-session re-evaluation to catch hijacked active sessions (impossible travel and device changes).
- **Account Recovery Risk Engine**: Scores password-reset attempts by device mismatch, request velocity, and recovery-channel strength before allowing a reset.
- **Analyst Dashboard**: A comprehensive, real-time dashboard for security analysts to monitor live sessions, risk distributions, onboarding attempts, and investigate suspicious activities.

---

## Project Structure

The repository is organized into a clean separation of concerns:

```text
Trustsphere/
├── frontend/                    # React + TypeScript Frontend
│   ├── src/
│   │   ├── components/          # Reusable UI components
│   │   ├── contexts/            # React Contexts (RBAC)
│   │   ├── lib/                 # Utility libraries (Supabase)
│   │   └── routes/              # TanStack Router pages (Dashboard, Insider, etc.)
│   └── package.json             # Frontend dependencies
│
├── backend/                     # FastAPI Python Backend
│   ├── app/
│   │   ├── engines/             # Core logic (Behavior, Network, Recovery, Insider,
│   │   │                        #   Onboarding/KYC, Document OCR, Face Verification)
│   │   ├── routers/             # API Endpoints (Auth, Onboarding, Config, etc.)
│   │   ├── services/            # Business logic (Sessions, Graph, OTP)
│   │   └── utils/               # Hashing, PDF/image decoding, rate limiting
│   ├── scripts/                 # Database seeding + one-off SQL (onboarding_attempts table)
│   └── main.py                  # API entry point
├── docs/
│   └── COMPLIANCE.md            # Regulatory readiness mapping
├── CHANGES.md                   # Running changelog of local dev fixes
└── README.md                    # Project documentation
```

---

## Tech Stack

### Frontend
- **React 18** (Vite)
- **TypeScript** & **Tailwind CSS** (Glassmorphism UI)
- **TanStack Router** (Type-safe routing)
- **Recharts** (Dashboard Data Visualization)

### Backend
- **FastAPI** (High-performance Async Python API)
- **EasyOCR** (Document text extraction — Aadhaar/PAN field & type verification)
- **DeepFace** (Facenet512) (Selfie-to-ID face verification)
- **PyMuPDF** (Rasterizes PDF ID-document uploads for OCR/face-match)
- **Scikit-Learn** (Machine Learning / Anomaly Detection)
- **Supabase / PostgreSQL** (Authentication & Relational Data)
- **Neo4j AuraDB** (Graph Database for Fraud Rings)

---

## Setup & Installation

### 1. Prerequisites
- Python 3.11+
- Node.js 18+
- Supabase Project & Neo4j AuraDB instance.

### 2. Backend Setup
Navigate to the backend directory and configure your environment:
```bash
cd backend
cp .env.example .env
# Edit .env and fill in your Supabase + Neo4j credentials

# Create virtual environment and install dependencies
python -m venv venv
source venv/bin/activate  # Or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
```

> **Windows note:** the ML/CV dependencies (PyTorch, DeepFace, MediaPipe) install
> some very deeply nested license files. If your project path is long (e.g.
> deep inside `Downloads\...`), venv creation/pip install can fail with a
> `WinError 206` path-too-long error. If that happens, create the venv at a
> short path instead (e.g. `C:\ts-venv`) and point your `uvicorn`/`pip`
> commands at it.

Create the full schema — every table the backend touches, plus Row Level
Security locked down on all of them (see **Production Readiness** below
for why RLS matters even though the backend itself uses the service-role
key). This can't be done through the app's Supabase client (no DDL over
the REST API), so run it once yourself in the **Supabase Dashboard → SQL
Editor**:
```bash
# paste the contents of this file into the SQL Editor and run it — it's
# idempotent, safe to re-run, and supersedes the older
# create_onboarding_attempts_table.sql / add_password_reset_columns.sql
# (both still exist for compatibility, but schema.sql is the single
# source of truth going forward):
backend/scripts/schema.sql
```

Train the ML model and seed the database. The ML model now auto-trains
itself in-memory on first use if `ml/model.pkl` is missing (see
`app/services/ml_service.py`), so this first line is a safety net, not a
strict requirement — but running it explicitly is still recommended so
the very first login doesn't pay the one-time training cost:
```bash
python ml/train_model.py
python scripts/seed_supabase.py
python scripts/seed_neo4j.py
python scripts/setup_dummy_analyst.py   # creates analyst@trustsphere.com / Analyst@123
python scripts/setup_real_users.py      # creates 5 demo customer accounts / Password@123
```

Start the FastAPI server on port 8001:
```bash
uvicorn main:app --port 8001 --reload
```
*The API will be live at `http://localhost:8001` with interactive docs at `/docs`.*

> **Windows note:** `--reload`'s multiprocessing-based worker respawn has
> been unreliable in some Windows setups during local testing (a stale
> worker can keep serving old code, or a duplicate process can grab the
> port). If restarts stop reflecting your code changes, kill all
> `python.exe` processes bound to port 8001 and start a single instance
> without `--reload`, restarting it manually after each change.

### 3. Frontend Setup
In a new terminal, start the React frontend:
```bash
cd frontend
npm install
npm run dev
```
*The web app will run at `http://localhost:8080` (or `5173`).*

New customers register via **`/signup`** — a 3-step flow (Details & Aadhaar
→ PAN Card → Selfie) that drives the KYC onboarding engine described above.
The **`/login`** page's "Register" link routes here directly; there is no
separate/lighter registration path, so every new account goes through KYC.

---

## Local Development Log

Every fix and change made while getting this running and hardening the KYC
flow locally is tracked, in order, in **[`CHANGES.md`](./CHANGES.md)** —
including a few known open items (e.g. Neo4j connectivity, the ML model
file) that are documented there rather than silently left broken.

**Known limitations, stated plainly** (see `CHANGES.md` for full detail):
- No liveness/anti-spoofing check on the selfie step — face-matching itself
  works, but a static photo submitted as both the selfie and the ID photo
  will pass.
- `behavior_signals` (typing/mouse telemetry used for bot detection) aren't
  cryptographically verified server-side — a scripted client can send
  plausible fake values.
- Document-type/number verification is keyword/regex-based OCR matching,
  not true forgery detection — it catches the wrong document or a made-up
  number, not a well-made fake with correct branding.

---

## Testing

```bash
cd backend
pip install -r requirements.txt   # includes pytest
python -m pytest tests/ -v
```

This runs **every unit test** (fingerprinting, scoring, onboarding,
recovery, insider/PAM, network, ML service self-healing, and the
security-fix regression tests) with zero external dependencies — the
Supabase/Neo4j/OCR/face-match boundary is mocked throughout, so this
suite runs in a few seconds and never needs credentials.

It will also print a number of `SKIPPED` results from `tests/integration/`
— those are **real integration tests** (RLS policy enforcement against
a live Supabase project, real Neo4j Cypher queries) that skip themselves
with an explicit reason when no real backing service is configured,
rather than silently passing. See **[`backend/tests/integration/README.md`](backend/tests/integration/README.md)**
for exactly how to run them for real, including a one-command local
Neo4j via `docker-compose.test.yml` that needs no cloud account at all.

**Load/latency measurement** — actually run, not just claimed:
```bash
cd backend
./venv/Scripts/python.exe tests/load_test.py
```
Measures the trust-score engine pipeline's real compute latency
(mocked I/O boundary, isolates algorithm cost) and HTTP-layer throughput
against your locally running dev server. See the script's own docstring
for what it does and doesn't measure — it's deliberately honest about
not being able to include live Supabase/Neo4j network round-trips
without the integration-test infrastructure above.

---

## Production Readiness

Three things stand between this running as a local demo and running as
a production deployment. All three now have everything they need
*written and ready* — what's left is infrastructure only a human with
real cloud credentials can provision, not something fixable in code:

1. **Real Supabase + Neo4j credentials.** `backend/.env.example` lists
   every variable needed. Once you have a real project, run
   `backend/scripts/schema.sql` against it (creates every table with
   Row Level Security enabled) before anything else.

2. **RLS verification.** `backend/scripts/schema.sql` locks every
   sensitive table down with real policies — customers see only their
   own rows, analysts/admins see across all customers, and the most
   sensitive tables (`otp_sessions`, `system_config`, `flagged_ips`) are
   deny-all to every client role, service-role only. This matters even
   though the FastAPI backend itself uses the service-role key (which
   bypasses RLS) — the frontend's Supabase Realtime subscription
   (`dashboard.tsx`, used for the "high-risk login" toast) talks to
   Supabase directly with the anon key, and RLS is what scopes what
   that subscription can actually see. Run
   `backend/tests/integration/test_rls_policies.py` against your real
   project to verify this for real, not just trust the SQL — see that
   file's docstring for the exact env vars it needs.

3. **Load testing at production scale.** `backend/tests/load_test.py`
   proves the engine-compute pipeline itself is fast (single-digit
   milliseconds, well under the architecture doc's "sub-80ms" claim) and
   that the HTTP stack sustains real concurrent throughput on a dev
   machine. It does **not** simulate production network latency to a
   real Supabase/Neo4j region, concurrent-user database contention, or
   a multi-worker Uvicorn deployment — those need to be measured against
   whatever real infrastructure you provision, at whatever concurrency
   you actually expect. Re-run it there before trusting a latency SLA.

---

## Security & Privacy
TrustSphere AI processes sensitive behavioral and device data. All network calls are secured, and passwords/OTPs are transmitted securely. 

- **Device Fingerprinting**: Only the cryptographically derived device hash is stored in the database. Raw canvas, WebGL, or audio fingerprint payloads are discarded. Device hashes are retained for up to 90 days of inactivity before purge (policy target).
- **Network Telemetry**: We collect IPs to derive country, city, and ASN flags for risk scoring. Persistent IP-to-identity tracking is not maintained beyond session scope, matching the standard 30-day audit log retention.
- **Behavioral Biometrics**: **No personal keystroke data (the actual characters typed) is stored**—only the timing metadata, flight times, and mouse-movement data are processed to protect user privacy. 

While our current IsolationForest model runs on synthetic data for this demo, a production rollout will continuously retrain on consented, anonymized behavioral logs containing the exact same timing features.

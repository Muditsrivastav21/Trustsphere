# TrustSphere AI — Change Log

Running log of what's been fixed/changed during local dev testing, in order.
Each entry: what broke or was missing, what was changed, which files.

---

### 1. Backend wouldn't start — missing `hash_string` function
`backend/app/utils/hashing.py` was missing `hash_string()`, which
`onboarding_engine.py` imported. Added a plain SHA-256 hex-digest helper.
**Files:** `backend/app/utils/hashing.py`

### 2. Frontend crashed under SSR — `sessionStorage` accessed at render time
`ContinuousTrustProvider.tsx` called `sessionStorage.getItem(...)` directly
during render, which breaks under TanStack Start's server-side rendering
(no `sessionStorage` in Node). Guarded with a `typeof window !== "undefined"` check.
**Files:** `frontend/src/contexts/ContinuousTrustProvider.tsx`

### 3. ID document upload failed on PDFs
`cv2.imdecode` can't decode PDF bytes as an image, so uploading a real
e-Aadhaar/e-KYC PDF silently broke OCR and face-match. Added
`image_decode.py` — detects PDF uploads and rasterizes the first page via
PyMuPDF before handing it to OCR/face detection.
**Files:** `backend/app/utils/image_decode.py`, `backend/requirements.txt`,
`backend/app/engines/document_engine.py`, `backend/app/engines/face_verification_engine.py`

### 4. ID format validation always assumed PAN format
`validate_id_format()` defaulted to PAN's regex regardless of what ID type
was actually submitted, so a valid 12-digit Aadhaar number always failed
validation. Added auto-detection (PAN / AADHAAR / SSN / generic) based on
the number's shape.
**Files:** `backend/app/engines/document_engine.py`

### 5. Face-mismatch was misreported when the document image couldn't be read
When a document image failed to decode, face comparison never actually
ran, but the code still reported it as `FACE_ID_MISMATCH` (implying a real
mismatch). Split into a distinct `DOCUMENT_IMAGE_UNREADABLE`/
`IMAGE_UNREADABLE` signal so a decode failure isn't confused with an actual
face mismatch.
**Files:** `backend/app/engines/face_verification_engine.py`,
`backend/app/engines/onboarding_engine.py`

### 6. Added two-step Aadhaar + PAN KYC flow
Signup previously collected one generic "National ID" field/document.
Rebuilt as a proper Indian KYC flow: separate Aadhaar and PAN number
fields, separate document uploads for each, OCR + cross-check run on both,
plus a cross-document consistency check (does the name on the Aadhaar
match the name on the PAN).
**Files:** `frontend/src/routes/signup.tsx`, `backend/app/models/requests.py`,
`backend/app/models/responses.py`, `backend/app/engines/onboarding_engine.py`,
`backend/app/routers/onboarding.py`, `backend/app/services/graph_service.py`

### 7. Dashboard queried a table name that didn't exist (`audit_logs` typo)
`dashboard.py`'s insider-alert stat queried `audit_logs` (plural); the real
table everywhere else in the codebase is `audit_log` (singular). Fixed the
typo.
**Files:** `backend/app/routers/dashboard.py`

### 8. Dashboard's "flagged recovery" stat queried a table that's never written to
`recovery_attempts` doesn't exist as a table, and nothing in the codebase
ever wrote to it — recovery attempts are actually logged into
`login_events` with `auth_action = "RECOVERY_{decision}"`. Fixed the query
to read from the real source of truth instead of creating a dead table.
**Files:** `backend/app/routers/dashboard.py`

### 9. `onboarding_attempts` Supabase table was missing entirely
Needed by signup, the analyst onboarding-review dashboard, and the
velocity-abuse check. Can't be created via the backend's Supabase client
(no DDL over REST) — wrote the `CREATE TABLE` SQL for you to run once in
the Supabase SQL Editor. **Not yet run** — table still missing as of
today, so onboarding attempts aren't persisted or reviewable yet.
**Files:** `backend/scripts/create_onboarding_attempts_table.sql`

### 10. Webcam gave a silent black box on failure
`react-webcam` had no error handler, so a blocked/denied camera permission
just showed a permanently blank box with no explanation. Added
`onUserMediaError`/`onUserMedia` handlers with a visible, specific message
(permission blocked / no camera / camera in use).
**Files:** `frontend/src/routes/signup.tsx`

### 11. KYC accepted any document as "the ID" — no type or number verification
OCR only checked "does the applicant's name appear somewhere in this
image" — it never checked whether the uploaded file was actually an
Aadhaar/PAN card, and `extracted_id_number` existed in the schema but was
never populated or compared against what was typed. Added:
- Document-type verification via fuzzy keyword/marker matching
  (`WRONG_{LABEL}_DOCUMENT_TYPE`)
- Printed-number extraction + cross-check against the form-submitted
  number (`{LABEL}_NUMBER_MISMATCH`)
- `UNVERIFIABLE_{LABEL}_DOCUMENT_TYPE` — escalates to manual review instead
  of silently passing when OCR can't extract enough text to judge the type
**Files:** `backend/app/engines/document_engine.py`,
`backend/app/engines/onboarding_engine.py`

### 12. Root `.gitignore` was silently broken (UTF-16 encoded)
Had a `FFFE` BOM — git can't parse UTF-16 ignore files, so it was
completely non-functional. Also `frontend/.gitignore` had no `.env` rule.
Rewrote both as plain UTF-8; verified no real secrets were staged before
the first commit/push.
**Files:** `.gitignore`, `frontend/.gitignore`, `backend/.gitignore`

### 13. Scoring thresholds disagreed across three places
`system_config` (the real, live values) has `allow=80, otp=68, block=56`.
But the *fallback* defaults used when Supabase is unreachable didn't match
that or each other: `responses.py`'s `ThresholdsResponse` defaulted to
`80/60/40`, `config.py`'s per-key fallback also used `80/60/40`, while
`scoring_engine.py` (which actually gates login decisions) defaulted to
`85/60/45`. A Supabase outage would have made the dashboard display
different thresholds than what was actually being enforced. All three now
default to `80/68/56`, matching the real configured values.
**Files:** `backend/app/models/responses.py`, `backend/app/routers/config.py`,
`backend/app/engines/scoring_engine.py`

### 14. Dashboard's insider-alert count queried the wrong `event_type`
`dashboard.py`'s `insider_alerts_count` stat filtered `audit_log` for
`event_type = "INSIDER_THREAT_ALERT"`, but the code that actually writes
insider-threat flags (`session_service.create_audit_log`) uses
`"INSIDER_THREAT_FLAGGED"` — the same value the dedicated
`/api/insider/anomalies` endpoint correctly queries. Result: the dashboard
stat was silently always 0, even though insider-threat detection itself
worked fine. Same bug class as #7 (`audit_logs`/`audit_log`) — that fix
only corrected the table name on that line, not this value.
Verified live: triggered a real `HIGH_VOLUME_ANOMALY` flag (3 rapid
`CONFIG_UPDATED` actions by one actor) and confirmed the fixed query finds
it (2 rows) while the old query still returns 0.
**Files:** `backend/app/routers/dashboard.py`

### 15. Login page's "Register" link bypassed KYC entirely
There were two disconnected front doors into account creation: the real
`/signup` KYC flow (Aadhaar/PAN, OCR, face-match, fraud scoring), and a
second, completely separate "Register" toggle right on the login page that
called `supabase.auth.signUp()` directly with just email/password/name —
skipping every fraud check built today. Anyone could create an account
through the login page and never touch KYC at all. Removed the login
page's inline registration mode entirely; "Register" now navigates to the
real `/signup` flow via `<Link to="/signup">`.
**Files:** `frontend/src/routes/login.tsx`

### 16. Account recovery never actually reset the password
`POST /api/recovery/initiate` correctly risk-scored attempts and sent an
OTP, and `POST /api/recovery/verify` correctly checked it — but nothing
ever changed the user's password. `recovery.tsx` just navigated to
`/login` after OTP success, leaving the old password in place. Built the
missing piece end-to-end:
- **New `POST /api/recovery/reset-password`** — requires the session's OTP
  to have been verified (`used == True`), within a 10-minute window of
  verification (`otp_sessions.verified_at`, new column), and can only be
  used once per verified session (`otp_sessions.password_reset_at`, new
  column — set on success, checked before allowing a repeat). Validates
  password strength server-side (length, not purely numeric, not on a
  common-password list) with specific error messages. Resolves the target
  user via the `login_events` row created in `initiate_recovery` (not a
  fresh email lookup, which could resolve to a different account).
  Actually updates the password via Supabase's admin API —
  `sb.auth.admin.update_user_by_id(user_id, {"password": ...})` — confirmed
  against the installed `gotrue` 2.12.3 source before writing the call, not
  assumed from docs. Writes a `PASSWORD_RESET_COMPLETED` audit log and
  sends a "your password was changed" notification (new, separate function
  from the OTP email) to the account's actual registered email.
- **Session invalidation fallback** — `gotrue` 2.12.3's admin API has no
  method to revoke every active session for a `user_id` (only
  `sign_out(jwt, scope)`, which needs a specific token). Added
  `users.password_changed_at` (new column) plus a centralized
  `session_service.is_token_stale()` check, wired into all 5 duplicated
  copies of `get_current_user`/`get_admin_user`
  (`auth.py`/`sessions.py`/`config.py`/`insider.py`/`dashboard.py`) —
  rejects any JWT whose `iat` claim predates the last password change.
- **Frontend**: `recovery.tsx` now shows a real "Set New Password" step
  after OTP verification (matching the page's existing visual style),
  client-side validates before submit, and shows a genuine success
  confirmation before redirecting to `/login` — no more silent redirect.
**Files:** `backend/app/routers/recovery.py`, `backend/app/services/otp_service.py`,
`backend/app/services/session_service.py`, `backend/app/models/requests.py`,
`backend/app/models/responses.py`, `backend/app/routers/{auth,sessions,config,insider,dashboard}.py`,
`backend/scripts/add_password_reset_columns.sql`, `frontend/src/routes/recovery.tsx`

### 17. Password reset called Supabase's admin API with the wrong user ID
Once the migration was run, a full live end-to-end test against real
Supabase Auth (not a mock) — create a throwaway user, initiate recovery,
verify the real OTP, reset the password, then actually attempt to sign in
with both the old and new passwords — caught a real bug: `reset-password`
called `sb.auth.admin.update_user_by_id(user_id, ...)` using
`users.id` (this app's own internal primary key, what `login_events.user_id`
points to), but that admin API operates on the **Supabase Auth** user ID,
which is stored separately as `users.auth_id`. These are two different
UUIDs. The call was failing every time with "User not found" (HTTP 502),
just never noticed before because no test had gone all the way to actually
verifying the password changed via a real sign-in. Fixed to use
`user["auth_id"]`.
**Verified live** (test user created, driven through the full flow,
password-changed proven via genuine `sign_in_with_password` calls with both
the old password — correctly rejected — and new password — correctly
accepted — then fully cleaned up, zero leftover rows): initiate → real OTP
fetched via service-role DB access → verify → reset succeeds → second
reset on the same session correctly rejected (400) → fabricated session_id
correctly rejected (400, proving the BLOCK-decision invariant holds) →
`users.password_changed_at` and `otp_sessions.password_reset_at` both
stamped → `PASSWORD_RESET_COMPLETED` audit row present.
**Files:** `backend/app/routers/recovery.py`

---

## Known open items (reported, not yet fixed)

- **Neo4j AuraDB unreachable** (DNS resolution failing) — fraud-ring/
  duplicate-identity graph checks are inert for both login and onboarding.
- **`onboarding_attempts` table still not created** (see #9) — run the SQL
  script when ready.
- **Phase 4 (automated tests for the reset-password endpoint) not yet
  written** — mocked-Supabase tests covering: missing/unused session,
  expired window, double-reset, weak passwords, and the BLOCK-decision
  invariant. Doesn't require the migration to be run.
- **`backend/ml/model.pkl` missing** — nobody's run `train_model.py` yet,
  so the IsolationForest anomaly-detection layer of behavioral biometrics
  is disabled (rule-based checks still work as a fallback).
- **`determine_auth_action()` in `auth_engine.py` is dead code** — never
  called; `scoring_engine.py` reimplements the same logic inline instead.
- **No liveness/anti-spoofing check** — identical selfie+ID-photo exploit
  confirmed live-testable (see KYC audit).
- **`behavior_signals` (typing/mouse telemetry) aren't cryptographically
  verified server-side** — a scripted client can send plausible fake values.
- **Document-type/number checks are keyword/regex-based**, not true
  forgery detection — won't catch a well-made fake with correct-looking
  branding and a fake-but-correctly-formatted number.

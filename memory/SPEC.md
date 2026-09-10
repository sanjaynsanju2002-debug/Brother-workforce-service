# Brothers Workforce Solutions — Spec

Manpower supply company website (Mysore, Karnataka) + PIN-protected admin dashboard.

## Routes
- `/` — Home: hero + trust badges, About, Services, Industries, Compliance, Job Listings,
  Worker Registration form, Company Manpower Request form, Clients placeholders, Contact, Footer.
- `/admin` — PIN gate then dashboard (stats, worker applications, company enquiries, job postings).

## Backend (all under /api)
Public (`backend/routers/public.py`):
- POST /api/workers -> Worker
- POST /api/workers/{id}/resume (multipart `file`) -> Worker; files in backend/uploads
- GET  /api/workers/{id}/resume -> file download
- POST /api/company-requests -> CompanyRequest
- GET  /api/jobs -> active jobs only

Clients (`backend/routers/clients.py`):
- GET /api/clients -> visible clients (public); GET /api/clients/{id}/logo -> logo image
- GET/POST /api/admin/clients, PATCH/DELETE /api/admin/clients/{id} (all `?pin=`)
- POST /api/admin/clients/{id}/logo (multipart `file`) -> logos in backend/uploads/logos
Seeded with 5 generic sector cards via `python seed_clients.py` (idempotent). The public
section falls back to hardcoded placeholders if zero visible clients exist.

Admin (`backend/routers/admin.py`, all take `?pin=`):
- POST /api/admin/login, GET /api/admin/stats
- GET /api/admin/traffic -> visits_total/today/week + workers & requests total/today
- GET /api/admin/security -> {pin, is_default}; POST /api/admin/security/pin {new_pin}
  (4-12 digits, stored in `settings` doc id="admin", overrides the ADMIN_PIN env fallback)
- GET/PATCH /api/admin/workers[/{id}] (status: New|Contacted|Deployed|Archived)
  GET supports filters: `skill_category`, `location` (regex over current+preferred),
  `availability`, `status`, `q` (name/mobile/skills/education/previous_experience).
  Location + q combine via `$and` so neither `$or` clobbers the other.
- GET /api/admin/worker-filters -> distinct skill_categories/locations/availabilities
- GET/PATCH /api/admin/company-requests[/{id}] (status: Pending|Quote Sent|In Progress|Closed)
- GET/POST /api/admin/jobs, PATCH /api/admin/jobs/{id} (active), DELETE /api/admin/jobs/{id}
- GET /api/admin/export/workers.csv, GET /api/admin/export/company-requests.csv

PIN checks go through `lib/auth.py: verify_pin()` (async, DB-first with env fallback) — used by
every admin router. Never re-add a local sync `_check`.

Visits (`POST /api/visits`, public): anonymous counter, no IP/cookie/personal data. The
frontend calls it from `lib/track.ts` with a sessionStorage guard so one browser session
counts once (this also neutralises StrictMode's double-invoked effects).

Email admin (`backend/routers/email_admin.py`, mounted under /api/admin/email, all take `?pin=`):
- GET /status -> key_configured, sender, recipients, using_shared_sender, key_restricted, domains[]
- POST /domains {name} -> adds a Resend sending domain, returns DNS records
- POST /domains/{id}/verify, DELETE /domains/{id}
- PUT /settings {sender, recipients[]} -> persists to the `settings` collection
- POST /test {to?} -> sends a test email
The Resend API key is NEVER returned to the frontend; only domain names/statuses and the
public DNS records are exposed.

## Data model
Collections: `workers`, `company_requests`, `jobs`, `settings` (one doc id="email" holding
sender + recipients; env values are the fallback). String uuid4 `id`. Models in
`backend/models/bws.py`, mirrored in `frontend/src/types.ts`.

## Admin tabs
Worker Applications | Company Enquiries | Job Postings | Email Settings | Clients | Security
(`frontend/src/components/site/EmailSettings.tsx`, `ClientsManager.tsx`, `Security.tsx`)
Dashboard header also shows a "Website Activity" funnel: People Visited / Applied for Jobs /
Requested Manpower, each with a total and a today count.

## Scheduled tasks
`.emergent/crons.yml` -> one cron `daily-digest`: `0 7 * * *` in `Asia/Kolkata`, POST to
`/api/cron/digest` (`backend/routers/cron.py`).
- Auth: `Authorization: Bearer $WEBHOOK_CRON_SECRET` (backend/.env), constant-time compare,
  401 on missing/wrong.
- Idempotent on `X-Webhook-Id` / envelope `run_id` via the `cron_runs` collection
  (30-day TTL index). Duplicate delivery returns 2xx with `queued: false`.
- Acks 2xx immediately and sends via BackgroundTasks. Summarises YESTERDAY's visits,
  applications and manpower requests; **skips sending entirely on zero-activity days**.

## Security note
The PIN is deliberately NOT displayed on the public `/admin` login screen — that page is
reachable by anyone and the dashboard exposes applicant phone numbers and resumes. The PIN is
only viewable in the Security tab after authenticating.

## Notes
- Email notifications via Resend (`backend/lib/notify.py`), sent as FastAPI BackgroundTasks:
  "New Worker Registration" and "New Manpower Requirement" -> NOTIFY_EMAIL.
  Requires `RESEND_API_KEY` in backend/.env. If the key is ABSENT, sending is a logged
  no-op and the form submission still succeeds (never fails a form on email).
  Env: RESEND_API_KEY, NOTIFY_EMAIL, SENDER_EMAIL.
- CSV export: GET /api/admin/export/workers.csv and /api/admin/export/company-requests.csv
  (both `?pin=`), streamed as attachments; "Download Spreadsheet" button on each admin tab.
- WhatsApp alerts are click-to-send wa.me deep links (no API/keys) with a prefilled message,
  one button per row in both admin tables. Falls back to `mobile` when `whatsapp` is empty;
  10-digit numbers get the 91 country code.
- Job listings start empty -> "No current openings" empty state.
- Client section shows placeholders only; no real client names.
- Brand rule: never display founder/proprietor/family names.
- Trust badge & compliance card order (fixed by client): Licensed Labour Contractor, GST,
  ESIC, EPF Services, MSME. Imagery uses Indian workforce/factory photos.

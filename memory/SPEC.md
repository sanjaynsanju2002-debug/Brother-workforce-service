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

Admin (`backend/routers/admin.py`, all take `?pin=`):
- POST /api/admin/login, GET /api/admin/stats
- GET/PATCH /api/admin/workers[/{id}] (status: New|Contacted|Deployed|Archived)
- GET/PATCH /api/admin/company-requests[/{id}] (status: Pending|Quote Sent|In Progress|Closed)
- GET/POST /api/admin/jobs, PATCH /api/admin/jobs/{id} (active), DELETE /api/admin/jobs/{id}

## Data model
Collections: `workers`, `company_requests`, `jobs`. String uuid4 `id`. Models in
`backend/models/bws.py`, mirrored in `frontend/src/types.ts`.

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

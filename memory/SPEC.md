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
- Email notification NOT implemented (user chose DB-only for now).
- Job listings start empty -> "No current openings" empty state.
- Client section shows placeholders only; no real client names.
- Brand rule: never display founder/proprietor/family names.

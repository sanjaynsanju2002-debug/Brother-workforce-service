"""Regression coverage for access boundaries, receipts, upload checks and health."""
from datetime import datetime, timezone
from io import BytesIO
from zipfile import ZipFile
import pytest
from fastapi import HTTPException
from starlette.requests import Request
from lib.permissions import permits
from lib.resume_validation import resume_media
from lib.submission_limits import limit_submission
from lib.audit_snapshot import summary
from tests.test_admin_session_and_application import FakeDB
from tests.test_operations import store, session, login, company, person, bill, payment, Collection

@pytest.mark.parametrize("role,path,method,allowed", [
    ("recruiter", "/api/admin/workers", "GET", True),
    ("recruiter", "/api/admin/payroll", "GET", False),
    ("operator", "/api/admin/invoices", "GET", False),
    ("viewer", "/api/admin/workers/x", "PATCH", False),
    ("finance", "/api/admin/operations/invoices/x/payments", "POST", True),
    ("finance", "/api/admin/team", "GET", False),
    ("attendance", "/api/admin/operations/attendance/access", "GET", False),
    ("attendance", "/api/admin/operations/attendance/x/approve", "POST", True),
    ("operator", "/api/admin/operations/attendance/x/approve", "POST", False),
    ("finance", "/api/admin/invoices/x", "DELETE", False),
    ("unknown", "/api/admin/jobs", "GET", False),
])
def test_roles_deny_unrelated_and_destructive_actions(role, path, method, allowed):
    assert permits(role, path, method) is allowed

@pytest.mark.asyncio
async def test_company_scope_and_server_permissions(store):
    async with session() as owner, session() as staff:
        await login(owner)
        first, other = await company(owner), await company(owner, "Other company")
        response = await owner.post("/api/admin/team", json={"name": "Attendance reviewer", "username": "attendance.test", "role": "attendance", "company_ids": [first["id"]], "pin": "73182549"})
        assert response.status_code == 200, response.text
        assert (await staff.post("/api/admin/login", json={"username": "attendance.test", "pin": "73182549"})).status_code == 200
        assert [c["id"] for c in (await staff.get("/api/admin/operations/attendance-companies")).json()] == [first["id"]]
        base = "/api/admin/operations/attendance"
        assert (await staff.get(base, params={"company_id": first["id"], "attendance_date": "2026-11-05"})).status_code == 200
        assert (await staff.get(base, params={"company_id": other["id"], "attendance_date": "2026-11-05"})).status_code == 403
        assert (await staff.get("/api/admin/invoices")).status_code == 403
        assert (await staff.get(base + "/access", params={"company_id": first["id"]})).status_code == 403
        assert (await owner.patch(f"/api/admin/team/{response.json()['id']}", json={"role": "recruiter"})).status_code == 200
        assert (await staff.get("/api/admin/me")).status_code == 401

@pytest.mark.asyncio
async def test_submission_budget_does_not_store_plain_ip():
    db = FakeDB()
    request = Request({"type": "http", "client": ("192.0.2.55", 123), "headers": []})
    await limit_submission(db, request, "worker", limit=2)
    await limit_submission(db, request, "worker", limit=2)
    with pytest.raises(HTTPException) as exc:
        await limit_submission(db, request, "worker", limit=2)
    assert exc.value.status_code == 429
    assert "192.0.2.55" not in str(db.public_rate_limits.records)
    await limit_submission(db, request, "company", limit=2)

@pytest.mark.parametrize("extension,content", [(".pdf", b'<script>alert(1)</script>'), (".png", b"%PDF-test"), (".doc", b"legacy"), (".docx", b"not a zip")])
def test_disguised_resumes_are_rejected(extension, content):
    with pytest.raises(HTTPException): resume_media(extension, content)

def test_docx_macros_and_embedded_objects_are_rejected():
    def document(extra):
        buf = BytesIO()
        with ZipFile(buf, 'w') as z:
            z.writestr('[Content_Types].xml', '<Types/>')
            z.writestr('word/document.xml', '<document/>')
            if extra: z.writestr(extra, b'payload')
        return buf.getvalue()
    assert resume_media('.docx', document(None)).endswith('document')
    for path in ('word/vbaProject.bin', 'word/embeddings/file.exe', '../outside'):
        with pytest.raises(HTTPException): resume_media('.docx', document(path))

def test_audit_summary_omits_credentials_contact_details_and_notes():
    result = summary({"status": "Approved", "mobile": "private", "pin_hash": "secret", "notes": "private note", "totals": {"total": "100.00"}, "rows": [{"full_name": "Private person", "status": "Present"}]})
    assert result == {"status": "Approved", "totals": {"total": "100.00"}, "attendance_status_counts": {"Present": 1}}

@pytest.mark.asyncio
async def test_partial_receipts_filter_and_audit_values(store):
    async with session() as c:
        await login(c); co = await company(c); invoice = await bill(c, co["id"])
        response = await c.post(f"/api/admin/operations/invoices/{invoice['id']}/payments", json=payment(1, "100.01"))
        assert response.status_code == 200, response.text
        partial = (await c.get('/api/admin/invoices', params={"payment_status": "Partially Paid"})).json()
        assert partial["total"] == 1 and partial["items"][0]["id"] == invoice["id"]
        assert (await c.get('/api/admin/invoices', params={"payment_status": "Paid"})).json()["total"] == 0
        event = store.audit_events.records[-1]
        assert event["before"]["payment_status"] == "Pending"
        assert event["after"]["payment_status"] == "Partially Paid"

@pytest.mark.asyncio
async def test_health_is_unready_without_database_and_ready_after_ping(monkeypatch):
    import server
    from types import SimpleNamespace
    async def ping(command): assert command == "ping"
    monkeypatch.setattr(server, 'db', SimpleNamespace(command=ping))
    monkeypatch.setattr(server.app.state, 'database_ready', False, raising=False)
    async with session() as c:
        assert (await c.get('/api/health/ready')).status_code == 503
        assert (await c.get('/api/health/live')).status_code == 200
        server.app.state.database_ready = True
        assert (await c.get('/api/health/ready')).status_code == 200
        assert (await c.post('/api/status', json={"client_name": "spam"})).status_code in {404, 405}

@pytest.mark.asyncio
async def test_jobs_remain_drafts_until_details_confirmed_and_archive_preserves_links(store):
    async with session() as c:
        await login(c)
        created = await c.post('/api/admin/jobs', json={"title": "Test role", "location": "Mysore", "skill_category": "General Worker"})
        assert created.status_code == 200, created.text
        job = created.json(); assert job['active'] is False
        assert (await c.patch(f"/api/admin/jobs/{job['id']}", json={"active": True})).status_code == 422
        assert (await c.delete(f"/api/admin/jobs/{job['id']}")).status_code == 200
        assert await store.jobs.find_one({"id": job['id']})

@pytest.mark.asyncio
async def test_profit_uses_gross_payroll_and_employer_costs_once(store):
    async with session() as c:
        await login(c); co = await company(c)
        store.payroll.records.append({"company_id": co['id'], "company_name": co['name'], "month": "2026-10", "cost_responsibility": "Agency", "totals": {"gross_wages": "1000.00", "payable": "850.00", "esi_employer_contribution": "33.00", "pf_employer_contribution": "120.00"}})
        store.expenses.records.extend([{ "month": "2026-10", "company_id": co['id'], "amount_paise": 85000, "cost_type": "Payroll"}, {"month": "2026-10", "company_id": co['id'], "amount_paise": 2000, "cost_type": "Operating"}])
        total = (await c.get('/api/admin/profit-loss?month=2026-10')).json()
        company_total = (await c.get('/api/admin/operations/profitability?month=2026-10')).json()['items'][0]
        assert total['payroll_cost'] == '1153.00' and total['expenses'] == '1173.00'
        assert total['profit_loss'] == company_total['profit'] == '-1173.00'
        assert total['salary_cash_expenses'] == '850.00'

def test_legacy_employee_approval_never_enters_monthly_exports():
    from lib.attendance_exports import register_rows
    register = {"month": "2026-10", "employees": [{"assignment_id": "employee"}], "sheets": [{"attendance_date": "2026-10-01", "status": "Draft", "rows": [{"assignment_id": "employee", "status": "Present", "employee_approved_at": "2026-10-01"}]}]}
    _, rows, ready = register_rows(register)
    assert ready == 0 and rows[0]['payable_days'] == 0
    register['sheets'][0]['status'] = 'Approved'
    _, rows, ready = register_rows(register)
    assert ready == 1 and rows[0]['payable_days'] == 1

@pytest.mark.asyncio
async def test_visit_and_journey_allow_only_bounded_anonymous_values(store, monkeypatch):
    from routers import journey
    store.journey_events = Collection()
    store.visits = Collection()
    monkeypatch.setattr(journey, 'db', store)
    async with session() as c:
        assert (await c.post('/api/visits', json={'path': '/'})).status_code == 200
        assert (await c.post('/api/visits', json={'path': '/?email=private@example.com'})).status_code == 422
        assert (await c.post('/api/journey', json={'event': 'candidate_start'})).status_code == 204
        assert (await c.post('/api/journey', json={'event': 'candidate_start', 'email': 'private@example.com'})).status_code == 422
        assert (await c.get('/api/admin/journey')).status_code == 401
        await login(c)
        assert (await c.get('/api/admin/journey')).json()['counts']['candidate_start'] == 1

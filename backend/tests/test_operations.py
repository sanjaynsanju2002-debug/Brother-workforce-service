"""Isolated integration coverage for attendance, financial ledgers and operations."""
import asyncio
import copy
import io
import os
import re
from datetime import datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4
from zipfile import ZipFile, ZIP_DEFLATED

import httpx
import pytest
from bson import json_util
from pypdf import PdfReader
from pymongo.errors import DuplicateKeyError

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "bws_operations_test")

from lib import auth
from lib.ledger import today
from routers import admin, assignments, backups, clients, expenses, finance, invoices, operations, payments, payroll, public, team
from server import app
from tests.test_invoices import payload as invoice_payload
from tests.test_site_improvements import BusinessCollection, Database as BaseDatabase


class Cursor:
    def __init__(self, rows): self.rows = rows
    def sort(self, field, direction=1):
        for name, order in reversed(field if isinstance(field, list) else [(field, direction)]):
            self.rows.sort(key=lambda r: (r.get(name) is not None, str(r.get(name, ""))), reverse=order < 0)
        return self
    def skip(self, n): self.rows = self.rows[n:]; return self
    def limit(self, n): self.rows = self.rows[:n]; return self
    async def to_list(self, n): return copy.deepcopy(self.rows if n is None else self.rows[:n])
    def __aiter__(self): self.iterator = iter(self.rows); return self
    async def __anext__(self):
        try: return copy.deepcopy(next(self.iterator))
        except StopIteration: raise StopAsyncIteration


class Collection(BusinessCollection):
    @classmethod
    def matches(cls, row, query):
        for field, expected in query.items():
            if field == "$or":
                if not any(cls.matches(row, q) for q in expected): return False
                continue
            if field == "$and":
                if not all(cls.matches(row, q) for q in expected): return False
                continue
            v = row.get(field)
            if not isinstance(expected, dict):
                if v != expected: return False
                continue
            for op, target in expected.items():
                if op == "$ne" and v == target: return False
                if op == "$in" and v not in target: return False
                if op == "$exists" and (field in row) != target: return False
                if op == "$gte" and (v is None or v < target): return False
                if op == "$gt" and (v is None or v <= target): return False
                if op == "$lte" and (v is None or v > target): return False
                if op == "$lt" and (v is None or v >= target): return False
                if op == "$regex" and not re.search(target, str(v or ""), re.I if expected.get("$options") == "i" else 0): return False
        return True

    @staticmethod
    def project(row, projection):
        r = copy.deepcopy(row)
        if not projection: return r
        includes = {k for k, v in projection.items() if v and k != "_id"}
        if includes: return {k: v for k, v in r.items() if k in includes or k == "_id" and projection.get("_id", 1)}
        return {k: v for k, v in r.items() if projection.get(k, 1)}
    def find(self, query=None, projection=None): return Cursor([self.project(r, projection) for r in self.records if self.matches(r, query or {})])
    async def find_one(self, query, projection=None): return next((self.project(r, projection) for r in self.records if self.matches(r, query)), None)
    async def update_one(self, query, changes, upsert=False):
        row = next((r for r in self.records if self.matches(r, query)), None)
        if row is None:
            if not upsert: return SimpleNamespace(matched_count=0)
            row = {k: v for k, v in query.items() if not isinstance(v, dict)}; self.records.append(row)
        row.update(copy.deepcopy(changes.get("$set", {})))
        for k in changes.get("$unset", {}): row.pop(k, None)
        for k, v in changes.get("$inc", {}).items(): row[k] = row.get(k, 0) + v
        return SimpleNamespace(matched_count=1)
    async def find_one_and_update(self, query, changes, projection=None, **kwargs):
        row = next((r for r in self.records if self.matches(r, query)), None)
        if row is None: return None
        await self.update_one(query, changes)
        return self.project(row, projection)
    def aggregate(self, stages):
        rows = self.records
        for stage in stages:
            if "$match" in stage: rows = [r for r in rows if self.matches(r, stage["$match"])]
            if "$group" in stage:
                if not rows: return Cursor([])
                group = {"_id": None}
                for field, expression in stage["$group"].items():
                    if field == "_id": continue
                    source = expression["$sum"]
                    group[field] = sum(r.get(source[1:], 0) if isinstance(source, str) else source for r in rows)
                rows = [group]
        return Cursor(copy.deepcopy(rows))


@pytest.fixture
def store(monkeypatch):
    db = BaseDatabase()
    for name in set(backups.COLLECTIONS) | {"admin_sessions", "admin_users", "admin_login_attempts"}:
        initial = copy.deepcopy(getattr(db, name).records) if hasattr(db, name) else []
        setattr(db, name, Collection()); getattr(db, name).records = initial
    db.jobs.records = []; db.company_requests.records = []
    for module in (auth, admin, assignments, backups, clients, expenses, finance, invoices, operations, payments, payroll, public, team): monkeypatch.setattr(module, "db", db)
    return db


def session(): return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://test.invalid")
async def login(c): assert (await c.post("/api/admin/login", json={"pin": "123456"})).status_code == 200
async def company(c, name="QA Factory"):
    r = await c.post("/api/admin/clients", json={"name": name, "visible": False}); assert r.status_code == 200, r.text; return r.json()
async def person(c, company_id, name="QA Employee", **extra):
    r = await c.post("/api/admin/assignments", json={"client_id": company_id, "full_name": name, "role": "Assembler", "salary": "500", "salary_basis": "Daily", **extra}); assert r.status_code == 200, r.text; return r.json()
async def bill(c, company_id, **extra):
    r = await c.post("/api/admin/invoices", json={**invoice_payload(), **extra, "company_id": company_id, "client_name": "QA Factory", "service_month": today()[:7]}); assert r.status_code == 200, r.text; return r.json()
async def payrun(c, company_id, people, **extra):
    body = {"company_id": company_id, "month": today()[:7], "lines": [{"assignment_id": p["id"], "worked_days": "2", "daily_rate": "500", "esi_percentage": "0", "pf_percentage": "0"} for p in people], **extra}
    r = await c.post("/api/admin/payroll", json=body); assert r.status_code == 200, r.text; return r.json(), body

def payment(revision, amount="100", **extra): return {"request_id": str(uuid4()), "revision": revision, "amount": amount, "payment_date": today(), "method": "UPI", "reference": "QA-REF", **extra}


@pytest.mark.asyncio
async def test_attendance_review_import_overtime_and_stale_approval(store):
    async with session() as c:
        await login(c); co = await company(c); a = await person(c, co["id"]); b = await person(c, co["id"], "QA Second")
        route = "/api/admin/operations"
        draft = (await c.get(f"{route}/attendance", params={"company_id": co["id"], "attendance_date": today()})).json()
        assert draft["sheet"] is None and len(draft["employees"]) == 2
        data = {"company_id": co["id"], "attendance_date": today(), "rows": [{"assignment_id": p["id"]} for p in (a, b)]}
        s = (await c.put(f"{route}/attendance", json=data)).json()
        assert (await c.post(f"{route}/attendance/{s['id']}/approve", json={"revision": 1})).status_code == 422
        data.update(revision=1, rows=[{"assignment_id": a["id"], "status": "Half-day", "overtime_hours": "2.5"}, {"assignment_id": b["id"], "status": "Absent"}])
        changed = await c.put(f"{route}/attendance", json=data); assert changed.status_code == 200, changed.text
        assert (await c.put(f"{route}/attendance", json=data)).status_code == 409
        s = (await c.post(f"{route}/attendance/{s['id']}/approve", json={"revision": 2})).json()
        assert s["approved_by"] == "Owner" and s["status"] == "Approved"
        assert (await c.put(f"{route}/attendance", json={**data, "revision": 3})).status_code == 409
        summary = (await c.get(f"{route}/attendance-summary", params={"company_id": co["id"], "month": today()[:7]})).json()
        assert summary["approved_days"] == 1 and summary["lines"][0]["worked_days"] == "0.50"
        saved, body = await payrun(c, co["id"], [a], attendance_refs={s["id"]: 3}, lines=[{"assignment_id": a["id"], "worked_days": "0.5", "daily_rate": "500", "overtime_hours": "2.5", "overtime_rate": "100", "esi_percentage": "0.75", "pf_percentage": "12"}])
        assert saved["totals"]["gross_wages"] == "500.00" and saved["totals"]["payable"] == "436.25"
        assert (await c.post(f"{route}/attendance/{s['id']}/reopen", json={"revision": 3})).status_code == 200
        assert (await c.post("/api/admin/payroll", json={**body, "revision": 1, "created_at": saved["created_at"]})).status_code == 409
        assert (await c.get(f"/api/admin/payroll/{saved['id']}")).json()["totals"] == saved["totals"]
        pdf = await c.get(f"/api/admin/payroll/{saved['id']}/download/pdf"); assert pdf.content.startswith(b"%PDF-")
        assert "OT: 2.5 h" in " ".join(p.extract_text() for p in PdfReader(io.BytesIO(pdf.content)).pages)


@pytest.mark.asyncio
async def test_attendance_requires_current_roster_and_respects_joining_and_leaving_dates(store):
    async with session() as c:
        await login(c); co = await company(c); p = await person(c, co["id"], start_date="2026-01-10")
        base = {"company_id": co["id"], "attendance_date": "2026-01-11", "rows": [{"assignment_id": p["id"], "status": "Present"}]}
        s = (await c.put("/api/admin/operations/attendance", json=base)).json()
        await person(c, co["id"], "QA Added", start_date="2026-01-11")
        assert (await c.post(f"/api/admin/operations/attendance/{s['id']}/approve", json={"revision": 1})).status_code == 409
        assert (await c.put("/api/admin/operations/attendance", json={**base, "attendance_date": "2026-02-30"})).status_code == 422
        assert (await c.put("/api/admin/operations/attendance", json={**base, "rows": [{"assignment_id": p["id"], "status": "Leave", "overtime_hours": "1"}]})).status_code == 422
        assert (await c.patch(f"/api/admin/assignments/{p['id']}", json={"status": "Completed", "end_date": "2026-01-12"})).status_code == 200
        before = (await c.get("/api/admin/operations/attendance", params={"company_id": co["id"], "attendance_date": "2026-01-12"})).json()
        after = (await c.get("/api/admin/operations/attendance", params={"company_id": co["id"], "attendance_date": "2026-01-13"})).json()
        assert p["id"] in {r["id"] for r in before["employees"]} and p["id"] not in {r["id"] for r in after["employees"]}
        assert (await c.patch(f"/api/admin/assignments/{p['id']}", json={"end_date": "2025-12-31"})).status_code == 422


@pytest.mark.asyncio
async def test_client_receipts_partial_full_void_replay_and_privacy(store):
    async with session() as c, session() as stranger:
        await login(c); co = await company(c); inv = await bill(c, co["id"])
        path = f"/api/admin/operations/invoices/{inv['id']}/payments"; first = payment(1, "100.01")
        r = await c.post(path, json=first); assert r.status_code == 200, r.text
        current = r.json(); assert current["payment_status"] == "Partially Paid" and len(current["payments"]) == 1
        assert (await c.post(path, json=first)).json() == current
        assert (await c.post(path, json={**first, "amount": "99"})).status_code == 409
        assert (await c.post(path, json=payment(1, "10"))).status_code == 409
        assert (await c.post(path, json=payment(2, "999999999999"))).status_code == 422
        assert (await c.patch(f"/api/admin/invoices/{inv['id']}/status", json={"revision": 2, "payment_status": "Paid"})).status_code == 409
        p_and_l = (await c.get(f"/api/admin/profit-loss?month={today()[:7]}")).json()
        assert Decimal(p_and_l["unpaid_invoice_amount"]) == Decimal(inv["totals"]["total"]) - Decimal("100.01")
        pdf_path = f"{path}/{first['request_id']}/receipt.pdf"
        assert (await stranger.get(pdf_path)).status_code == 401
        receipt = await c.get(pdf_path); assert receipt.content.startswith(b"%PDF-")
        assert "100.01" in PdfReader(io.BytesIO(receipt.content)).pages[0].extract_text()
        balance = str(Decimal(inv["totals"]["total"]) - Decimal("100.01"))
        full = (await c.post(path, json=payment(2, balance))).json(); assert full["payment_status"] == "Paid"
        void = await c.post(f"{path}/{first['request_id']}/void", json={"revision": 3, "reason": "Duplicate bank entry"})
        assert void.status_code == 200, void.text
        assert void.json()["payment_status"] == "Partially Paid" and void.json()["payments"][0]["voided_by"] == "Owner"
        assert (await c.post(f"{path}/{first['request_id']}/void", json={"revision": 3, "reason": "Duplicate bank entry"})).status_code == 200
        assert (await c.delete(f"/api/admin/invoices/{inv['id']}?revision=4")).status_code == 409
        assert "VOID" in PdfReader(io.BytesIO((await c.get(pdf_path)).content)).pages[0].extract_text()


@pytest.mark.asyncio
async def test_simultaneous_receipts_and_future_dates_are_safe(store):
    async with session() as c:
        await login(c); co = await company(c); inv = await bill(c, co["id"])
        path = f"/api/admin/operations/invoices/{inv['id']}/payments"
        responses = await asyncio.gather(c.post(path, json=payment(1, "10")), c.post(path, json=payment(1, "20")))
        assert sorted(r.status_code for r in responses) == [200, 409]
        saved = (await c.get(f"/api/admin/invoices/{inv['id']}")).json(); assert saved["revision"] == 2 and len(saved["payments"]) == 1
        future = (datetime.fromisoformat(today()) + timedelta(days=1)).date().isoformat()
        assert (await c.post(path, json=payment(2, "10", payment_date=future))).status_code == 422


@pytest.mark.asyncio
async def test_legacy_paid_balance_and_invoice_edit_preserve_receipts(store):
    async with session() as c:
        await login(c); co = await company(c); inv = await bill(c, co["id"])
        doc = store.invoices.records[0]; doc.pop("opening_paid_amount"); doc.pop("payments"); doc["payment_status"] = "Paid"
        assert (await c.post(f"/api/admin/operations/invoices/{inv['id']}/payments", json=payment(1))).status_code == 422
        original_paid = doc["totals"]["total"]
        body = {k: v for k, v in inv.items() if k in invoices.InvoiceUpdate.model_fields}; body["service_percentage"] = "20"
        edited = await c.put(f"/api/admin/invoices/{inv['id']}", json=body); assert edited.status_code == 200, edited.text
        assert edited.json()["opening_paid_amount"] == original_paid and edited.json()["payment_status"] == "Partially Paid"
        record = (await c.post(f"/api/admin/operations/invoices/{inv['id']}/payments", json=payment(2))).json()
        body.update(revision=3, service_percentage="0")
        assert (await c.put(f"/api/admin/invoices/{inv['id']}", json=body)).status_code == 422
        assert (await c.get(f"/api/admin/invoices/{inv['id']}")).json()["payments"] == record["payments"]


@pytest.mark.asyncio
async def test_salary_advances_balances_edit_protection_and_private_payslips(store):
    async with session() as c, session() as stranger:
        await login(c); co = await company(c); a = await person(c, co["id"]); b = await person(c, co["id"], "Private Other Employee")
        p, body = await payrun(c, co["id"], [a, b]); path = f"/api/admin/operations/payroll/{p['id']}/payments"
        advance = payment(1, "200", assignment_id=a["id"], kind="Advance")
        paid = await c.post(path, json=advance); assert paid.status_code == 200, paid.text
        assert (await c.post(path, json=advance)).json() == paid.json()
        register = (await c.get(f"/api/admin/operations/salary-register?month={today()[:7]}")).json()["items"]
        r = next(r for r in register if r["assignment_id"] == a["id"]); assert r["advances"] == "200.00" and r["balance"] == "800.00"
        assert (await c.post(path, json=payment(2, "801", assignment_id=a["id"], kind="Salary"))).status_code == 422
        body["lines"][0]["daily_rate"] = "50"
        assert (await c.post("/api/admin/payroll", json={**body, "revision": 2, "created_at": p["created_at"]})).status_code == 422
        slip = f"/api/admin/operations/payroll/{p['id']}/payslip/{a['id']}.pdf"; assert (await stranger.get(slip)).status_code == 401
        text = " ".join(page.extract_text() for page in PdfReader(io.BytesIO((await c.get(slip)).content)).pages)
        assert "QA Employee" in text and "Private Other Employee" not in text and "800.00" in text
        overview = (await c.get("/api/admin/operations/overview")).json(); assert overview["salary_paid"] == "200.00" and overview["salary_balance"] == "1800.00"
        assert (await c.post(f"{path}/{advance['request_id']}/void", json={"revision": 2, "reason": "Incorrect employee entry"})).status_code == 200
        current = (await c.get(f"/api/admin/payroll/{p['id']}")).json()
        assert (await c.delete(f"/api/admin/payroll/{p['id']}", params={"revision": 3, "updated_at": current["updated_at"]})).status_code == 409


@pytest.mark.asyncio
async def test_staffing_recruitment_and_actionable_followups(store):
    async with session() as c:
        await login(c); co = await company(c); a = await person(c, co["id"]); path = "/api/admin/operations"
        requirement = {"company_id": co["id"], "role": "Assembler", "required_count": 3, "needed_date": today(), "follow_up_date": today()}
        target = await c.put(f"{path}/requirements", json=requirement); assert target.status_code == 200, target.text
        assert (await c.put(f"{path}/requirements", json=requirement)).status_code == 409
        rows = (await c.get(f"{path}/requirements")).json(); assert rows[0]["shortage"] == 2 and rows[0]["deployed"] == 1 and rows[0]["present"] is None
        sheet = (await c.put(f"{path}/attendance", json={"company_id": co["id"], "attendance_date": today(), "rows": [{"assignment_id": a["id"], "status": "Absent"}]})).json()
        await c.post(f"{path}/attendance/{sheet['id']}/approve", json={"revision": 1})
        assert (await c.get(f"{path}/requirements")).json()[0]["present"] == 0
        rec = {"worker_id": a["worker_id"], "company_id": co["id"], "stage": "Interview", "follow_up_date": today()}
        assert (await c.put(f"{path}/recruitment", json=rec)).status_code == 422
        rec["interview_date"] = today(); recruited = await c.put(f"{path}/recruitment", json=rec); assert recruited.status_code == 200, recruited.text
        assert (await c.put(f"{path}/recruitment", json={**rec, "revision": 1, "stage": "No-show", "joining_date": today()})).status_code == 200
        assert len(store.workers.records) == len(store.assignments.records) == 1
        overview = (await c.get(f"{path}/overview")).json(); assert overview["shortages"] == 2 and overview["absent"] == 1 and overview["unmarked"] == 0
        assert {r["kind"] for r in overview["reminders"]} == {"Staffing", "Recruitment"}
        assert (await c.put(f"{path}/requirements", json={**requirement, "revision": 1, "status": "Closed"})).status_code == 200
        assert (await c.get(f"{path}/overview")).json()["shortages"] == 0


@pytest.mark.asyncio
async def test_private_documents_validation_revisions_and_backup_compatibility(store):
    async with session() as c, session() as stranger:
        await login(c); co = await company(c); p = await person(c, co["id"]); await payrun(c, co["id"], [p])
        path = f"/api/admin/operations/documents/{uuid4()}"
        data = {"worker_id": p["worker_id"], "title": "Qualification certificate", "category": "Worker onboarding", "status": "Missing", "follow_up_date": today(), "expiry_date": today()}
        r = await c.put(path, json=data); assert r.status_code == 200, r.text
        fake_pdf = b"%PDF-1.4\nQA private document"
        assert (await c.post(path + "/file?revision=1", files={"file": ("bad.pdf", b"<script>bad</script>")})).status_code == 422
        upload = await c.post(path + "/file?revision=1", files={"file": ("qualification.pdf", fake_pdf, "application/pdf")}); assert upload.status_code == 200, upload.text
        assert "file_data" not in upload.json() and upload.json()["status"] == "Received"
        assert (await c.post(path + "/file?revision=1", files={"file": ("file.pdf", fake_pdf)})).status_code == 409
        assert (await stranger.get(path + "/file")).status_code == 401 and (await c.get(path + "/file")).content == fake_pdf
        overview = (await c.get("/api/admin/operations/overview")).json(); assert {r["kind"] for r in overview["reminders"]} == {"Document", "Document expiry"}
        backup = await c.get("/api/admin/backups/download"); assert backup.status_code == 200
        with ZipFile(io.BytesIO(backup.content)) as z:
            assert "documents.json" in z.namelist() and "salary_payments" in z.read("payroll.json").decode()
            assert bytes(json_util.loads(z.read("documents.json"))[0]["file_data"]) == fake_pdf
        store.documents.records = []
        file = {"file": ("backup.zip", backup.content, "application/zip")}
        inspected = await c.post("/api/admin/backups/inspect", files=file); assert inspected.status_code == 200, inspected.text
        assert inspected.json()["counts"]["documents"]["new"] == 1
        restored = await c.post("/api/admin/backups/restore", files=file, data={"sha256": inspected.json()["sha256"]}); assert restored.status_code == 200, restored.text
        assert (await c.get(path + "/file")).content == fake_pdf
        old = io.BytesIO()
        with ZipFile(io.BytesIO(backup.content)) as source, ZipFile(old, "w", ZIP_DEFLATED) as target:
            for name in ["manifest.json", *(n + ".json" for n in backups.BASE_COLLECTIONS)]:
                content = source.read(name)
                if name == "manifest.json":
                    manifest = json_util.loads(content); manifest["version"] = 1; content = json_util.dumps(manifest).encode()
                target.writestr(name, content)
        assert (await c.post("/api/admin/backups/inspect", files={"file": ("old.zip", old.getvalue())})).status_code == 200


@pytest.mark.asyncio
async def test_company_profitability_avoids_double_payroll_cost_and_excludes_client_paid_wages(store):
    async with session() as c:
        await login(c); a = await company(c); b = await company(c, "Client Pays Company")
        p = await person(c, a["id"]); q = await person(c, b["id"])
        await payrun(c, a["id"], [p]); client_p, _ = await payrun(c, b["id"], [q], cost_responsibility="Client")
        await bill(c, a["id"])
        s = invoice_payload(); s.update(billing_mode="services_only", lines=[{"key": "men", "quantity": "1", "rate": "1000"}, {"key": "women", "quantity": "0", "rate": "0"}], service_percentage="10", gst_amount="0")
        await bill(c, b["id"], **s)
        for value, cid, cost in (("50", a["id"], "Operating"), ("1000", a["id"], "Payroll"), ("20", "", "Operating")):
            r = await c.post("/api/admin/expenses", data={"request_id": str(uuid4()), "expense_date": today(), "description": "QA business cost", "amount": value, "company_id": cid, "cost_type": cost}); assert r.status_code == 200, r.text
        report = (await c.get(f"/api/admin/operations/profitability?month={today()[:7]}")).json(); rows = {r["company_id"]: r for r in report["items"]}
        assert rows[a["id"]]["payroll_cost"] == "1000.00" and rows[a["id"]]["operating_expenses"] == "50.00"
        assert rows[a["id"]]["salary_cash_expenses"] == "1000.00" and Decimal(rows[a["id"]]["profit"]) == Decimal(rows[a["id"]]["revenue"]) - Decimal("1050")
        assert rows[b["id"]]["revenue"] == "100.00" and rows[b["id"]]["payroll_cost"] == "0.00" and rows[None]["profit"] == "-20.00"
        overview = (await c.get("/api/admin/operations/overview")).json(); assert overview["salary_payable"] == "1000.00"
        assert (await c.post(f"/api/admin/operations/payroll/{client_p['id']}/payments", json=payment(1, assignment_id=q["id"], kind="Salary"))).status_code == 422


@pytest.mark.asyncio
async def test_new_sections_are_private_and_activity_is_owner_only_and_has_no_credentials(store):
    async with session() as owner, session() as viewer:
        for endpoint in ("overview", "requirements", "recruitment", "documents", "salary-register?month=2026-10", "profitability?month=2026-10", "activity"):
            assert (await viewer.get("/api/admin/operations/" + endpoint)).status_code == 401
        await login(owner)
        account = await owner.post("/api/admin/team", json={"name": "QA Viewer", "username": "qa.viewer", "pin": "12345678", "role": "viewer"}); assert account.status_code == 200
        await viewer.post("/api/admin/login", json={"username": "qa.viewer", "pin": "12345678"})
        co = await company(owner); data = {"company_id": co["id"], "role": "Assembler", "required_count": 4, "needed_date": today()}
        assert (await viewer.put("/api/admin/operations/requirements", json=data)).status_code == 403
        assert (await viewer.get("/api/admin/operations/activity")).status_code == 403
        assert (await owner.put("/api/admin/operations/requirements", json=data)).status_code == 200
        events = (await owner.get("/api/admin/operations/activity?q=Assembler")).json()
        assert len(events["items"]) == 1 and events["items"][0]["actor"] == "Owner" and "Assembler" in events["items"][0]["subject"]
        dump = str(store.audit_events.records); assert "123456" not in dump and "pin_hash" not in dump and "token_hash" not in dump
        assert (await owner.put("/api/admin/operations/requirements", json=data)).status_code == 409
        assert len((await owner.get("/api/admin/operations/activity?q=Assembler")).json()["items"]) == 1


@pytest.mark.asyncio
async def test_archived_links_remain_correctable_and_missing_document_count_is_visible(store):
    async with session() as c:
        await login(c); co = await company(c); p = await person(c, co["id"])
        target = {"company_id": co["id"], "role": "Assembler", "required_count": 2, "needed_date": today(), "follow_up_date": today()}
        assert (await c.put("/api/admin/operations/requirements", json=target)).status_code == 200
        progress = {"worker_id": p["worker_id"], "company_id": co["id"], "stage": "Interview", "interview_date": today()}
        assert (await c.put("/api/admin/operations/recruitment", json=progress)).status_code == 200
        document = {"worker_id": p["worker_id"], "title": "Paper onboarding form", "category": "Worker onboarding", "status": "Missing"}
        path = f"/api/admin/operations/documents/{uuid4()}"
        assert (await c.put(path, json=document)).status_code == 200
        overview = (await c.get("/api/admin/operations/overview")).json()
        assert overview["missing_documents"] == 1 and "Interview" in {r["kind"] for r in overview["reminders"]}
        store.clients.records[0]["archived"] = True; store.assignments.records[0]["company_archived"] = True
        # Preserve outcomes and checklist updates even after a source profile is removed.
        store.workers.records = []
        assert (await c.put("/api/admin/operations/recruitment", json={**progress, "revision": 1, "stage": "Withdrawn"})).status_code == 200
        assert (await c.put(path, json={**document, "revision": 1, "status": "Not required"})).status_code == 200
        assert (await c.put("/api/admin/operations/requirements", json={**target, "revision": 1, "status": "Closed"})).status_code == 200
        overview = (await c.get("/api/admin/operations/overview")).json()
        assert overview["deployed_workers"] == overview["shortages"] == overview["missing_documents"] == 0
        assert overview["reminders"] == []

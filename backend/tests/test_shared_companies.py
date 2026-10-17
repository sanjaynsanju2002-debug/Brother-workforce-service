"""Company choices stay consistent while saved financial records retain snapshots."""

import copy
import os
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "bws_shared_companies_test")

from lib import auth
from routers import admin, assignments, clients, invoices, payroll
from server import app
from tests.test_admin_session_and_application import FakeDB
from tests.test_invoices import payload as invoice_payload
from tests.test_payroll import Collection


class CompanyCollection(Collection):
    async def delete_many(self, query):
        removed = [row for row in self.records if self.matches(row, query)]
        self.records = [row for row in self.records if not self.matches(row, query)]
        return SimpleNamespace(deleted_count=len(removed))


@pytest.fixture
def company_db(monkeypatch):
    fake = FakeDB()
    for collection in ("clients", "invoice_companies", "invoices", "assignments", "payroll", "client_logos", "workers"):
        setattr(fake, collection, CompanyCollection())
    for module in (auth, admin, assignments, clients, invoices, payroll):
        monkeypatch.setattr(module, "db", fake)
    return fake


@pytest.mark.asyncio
async def test_workforce_company_and_employee_appear_in_invoice_and_payroll(company_db):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://test.invalid") as client:
        await client.post("/api/admin/login", json={"pin": "123456"})
        created = await client.post("/api/admin/clients", json={"name": " Factory A ", "location": "Mysuru", "visible": False})
        assert created.status_code == 200, created.text
        company = created.json()
        invoice_companies = (await client.get("/api/admin/invoices/companies")).json()
        assert [(row["id"], row["name"], row["address"]) for row in invoice_companies] == [(company["id"], "Factory A", "Mysuru")]
        assert (await client.get("/api/admin/payroll/companies")).json() == [{"id": company["id"], "name": "Factory A", "saved_only": False}]
        assert (await client.get("/api/clients")).json() == []
        assert (await client.post("/api/admin/invoices/companies", json={"name": "factory   a"})).status_code == 409
        person = (await client.post("/api/admin/assignments", json={"client_id": company["id"], "full_name": "Example Employee", "salary": "500", "salary_basis": "Daily"})).json()
        draft = (await client.get("/api/admin/payroll/draft", params={"company_id": company["id"], "month": "2026-10"})).json()
        assert [row["assignment_id"] for row in draft["employees"]] == [person["id"]]
        assert (await client.delete(f"/api/admin/assignments/{person['id']}")).status_code == 200
        draft = (await client.get("/api/admin/payroll/draft", params={"company_id": company["id"], "month": "2026-10"})).json()
        assert draft["employees"] == []
        assert len((await client.get("/api/admin/talents")).json()) == 1
        assert len((await client.get("/api/admin/invoices/companies")).json()) == 1


@pytest.mark.asyncio
async def test_deleting_company_removes_active_choices_and_roster_but_keeps_history(company_db):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://test.invalid") as client:
        await client.post("/api/admin/login", json={"pin": "123456"})
        company = (await client.post("/api/admin/invoices/companies", json={"name": "Factory A", "address": "Mysuru", "gstin": "29EXAMPLE"})).json()
        person = (await client.post("/api/admin/assignments", json={"client_id": company["id"], "full_name": "Example Employee", "mobile": "9876543210"})).json()
        bill_data = {**invoice_payload(), "company_id": company["id"], "client_name": company["name"]}
        bill_result = await client.post("/api/admin/invoices", json=bill_data)
        assert bill_result.status_code == 200, bill_result.text
        bill = bill_result.json()
        run_result = await client.post("/api/admin/payroll", json={"company_id": company["id"], "month": "2026-10", "lines": [{"assignment_id": person["id"], "worked_days": "26", "daily_rate": "500", "esi_percentage": "0.75", "pf_percentage": "12"}]})
        assert run_result.status_code == 200, run_result.text
        run = run_result.json()
        assert (await client.delete(f"/api/admin/clients/{company['id']}")).status_code == 200
        assert (await client.get("/api/admin/clients")).json() == []
        assert (await client.get("/api/admin/invoices/companies")).json() == []
        assert (await client.get("/api/admin/assignments")).json() == []
        assert (await client.get("/api/admin/payroll/companies")).json() == [{"id": company["id"], "name": company["name"], "saved_only": True}]
        assert len((await client.get("/api/admin/talents")).json()) == 1
        assert (await client.get(f"/api/admin/invoices/{bill['id']}")).json() == bill
        assert (await client.get(f"/api/admin/payroll/{run['id']}")).json() == run
        history = (await client.get("/api/admin/invoices")).json()
        assert history["items"] == [bill]
        draft = (await client.get("/api/admin/payroll/draft", params={"company_id": company["id"], "month": "2026-10"})).json()
        assert draft["payroll"] == run and len(draft["employees"]) == 1
        assert (await client.get("/api/admin/payroll/draft", params={"company_id": company["id"], "month": "2026-11"})).status_code == 404
        assert (await client.post("/api/admin/invoices", json={**bill_data, "request_id": str(uuid4()), "invoice_number": "NEW-001"})).status_code == 404
        update = {key: value for key, value in bill.items() if key in invoices.InvoiceUpdate.model_fields}
        edited = await client.put(f"/api/admin/invoices/{bill['id']}", json={**update, "notes": "Updated historical bill"})
        assert edited.status_code == 200, edited.text
        assert edited.json()["totals"] == bill["totals"]
        restored = await client.post("/api/admin/clients", json={"name": "Factory A", "visible": False})
        assert restored.status_code == 200, restored.text
        assert restored.json()["id"] == company["id"]
        assert (await client.get("/api/admin/invoices/companies")).json()[0]["gstin"] == "29EXAMPLE"


@pytest.mark.asyncio
async def test_legacy_invoice_company_links_and_names_are_preserved(company_db):
    old_id, roster_id = str(uuid4()), str(uuid4())
    now = datetime.now(timezone.utc)
    legacy = {"id": old_id, "name": "Factory A", "address": "Old billing address", "gstin": "29OLD", "created_at": now}
    await company_db.invoice_companies.insert_one(copy.deepcopy(legacy))
    await company_db.clients.insert_one({"id": roster_id, "name": "factory   a", "visible": False, "created_at": now})
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://test.invalid") as client:
        await client.post("/api/admin/login", json={"pin": "123456"})
        rows = (await client.get("/api/admin/invoices/companies")).json()
        assert len(rows) == 1 and rows[0]["id"] == old_id
        assert rows[0]["gstin"] == "29OLD"
        renamed = await client.patch(f"/api/admin/clients/{roster_id}", json={"name": "Renamed Factory"})
        assert renamed.status_code == 200, renamed.text
        assert (await client.get("/api/admin/invoices/companies")).json()[0]["name"] == "Renamed Factory"
        assert (await client.delete(f"/api/admin/clients/{roster_id}")).status_code == 200
        assert (await client.get("/api/admin/invoices/companies")).json() == []
        assert (await client.get("/api/admin/payroll/companies")).json() == []


@pytest.mark.asyncio
async def test_older_invoice_only_company_is_reused_when_added_in_workforce(company_db):
    old_id = str(uuid4())
    await company_db.invoice_companies.insert_one({"id": old_id, "name": "Factory A", "address": "Billing address", "created_at": datetime.now(timezone.utc)})
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://test.invalid") as client:
        await client.post("/api/admin/login", json={"pin": "123456"})
        added = await client.post("/api/admin/clients", json={"name": " factory   a ", "visible": False})
        assert added.status_code == 200, added.text
        assert added.json()["id"] == old_id
        assert len((await client.get("/api/admin/invoices/companies")).json()) == 1
        assert len((await client.get("/api/admin/payroll/companies")).json()) == 1
        assert (await client.post("/api/admin/clients", json={"name": "Factory A"})).status_code == 409

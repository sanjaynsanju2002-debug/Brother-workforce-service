"""User journeys for shared records, recoverability and access boundaries."""

import copy
import io
import os
from uuid import uuid4
from types import SimpleNamespace
from zipfile import ZipFile

import httpx
import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "bws_improvements_test")

from lib import auth
from lib.workforce import reconcile_companies, reconcile_workforce
from models.bws import Worker
from routers import admin, assignments, backups, clients, invoices, payroll, public, service_info, team
from server import app
from tests.test_admin_session_and_application import FakeDB
from tests.test_invoices import payload as invoice_payload
from tests.test_shared_companies import CompanyCollection


class BusinessCollection(CompanyCollection):
    async def update_one(self, query, changes, **kwargs):
        row = next((row for row in self.records if self.matches(row, query)), None)
        if row is None and kwargs.get("upsert"):
            self.records.append({**query, **copy.deepcopy(changes.get("$set", {}))})
            return SimpleNamespace(matched_count=0, upserted_id=query.get("id"))
        result = await super().update_one(query, changes, **kwargs)
        if row is not None:
            for key in changes.get("$unset", {}):
                row.pop(key, None)
        return result


class Database(FakeDB):
    def __getitem__(self, name):
        return getattr(self, name)


@pytest.fixture
def business(monkeypatch):
    fake = Database()
    for name in set(backups.COLLECTIONS) | {"admin_users"}:
        original = getattr(fake, name, None)
        collection = BusinessCollection()
        collection.records = copy.deepcopy(original.records) if original else []
        setattr(fake, name, collection)
    fake.jobs.records = []
    fake.company_requests.records = []
    for module in (auth, admin, assignments, backups, clients, invoices, payroll, public, service_info, team):
        monkeypatch.setattr(module, "db", fake)

    async def no_notification(*args, **kwargs):
        pass

    monkeypatch.setattr(public, "send_notification", no_notification)
    return fake


def session():
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://test.invalid")


async def company(client, name="Example Factory"):
    response = await client.post("/api/admin/clients", json={"name": name, "visible": False})
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.asyncio
async def test_job_edit_explains_missing_hiring_company_and_can_save_without_search_verification(business):
    async with session() as client:
        await client.post("/api/admin/login", json={"pin": "123456"})
        details = {"title": "Assembler", "location": "Mysore", "skill_category": "General Worker", "openings": 20,
                   "description": "Assemble components according to work instructions and check completed units for quality. " * 2,
                   "qualification": "Discuss during screening", "working_hours": "8 hours/day", "employer_name": "",
                   "salary": "16000", "salary_basis": "Gross monthly", "benefits": "Discuss during screening",
                   "description_kn": "ಬಿಡಿಭಾಗಗಳನ್ನು ಜೋಡಿಸಿ ಮತ್ತು ಗುಣಮಟ್ಟವನ್ನು ಪರಿಶೀಲಿಸಿ.", "schema_ready": False}
        created = await client.post("/api/admin/jobs", json=details)
        assert created.status_code == 200, created.text
        path = f"/api/admin/jobs/{created.json()['id']}"
        blocked = await client.put(path, json={**details, "schema_ready": True})
        assert blocked.status_code == 422
        assert "hiring company" in blocked.json()["detail"][0]["msg"]
        assert "turn off job search verification" in blocked.json()["detail"][0]["msg"]
        saved = await client.put(path, json={**details, "working_hours": "8 hours/day, 6 days/week"})
        assert saved.status_code == 200, saved.text
        assert saved.json()["working_hours"] == "8 hours/day, 6 days/week"
        assert saved.json()["schema_ready"] is False and saved.json()["employer_name"] == ""


@pytest.mark.asyncio
async def test_multiple_deployments_and_linked_talent_protection(business):
    async with session() as client:
        await client.post("/api/admin/login", json={"pin": "123456"})
        a, b = await company(client), await company(client, "Second Factory")
        person = {"full_name": "Example Employee", "mobile": "9876543210", "client_id": a["id"]}
        first = (await client.post("/api/admin/assignments", json=person)).json()
        second = (await client.post("/api/admin/assignments", json={**person, "client_id": b["id"], "worker_id": first["worker_id"]})).json()
        worker_id = first["worker_id"]
        assert (await client.delete(f"/api/admin/talents/{worker_id}")).status_code == 409
        assert (await client.patch(f"/api/admin/workers/{worker_id}", json={"status": "Archived"})).status_code == 409
        await client.patch(f"/api/admin/assignments/{first['id']}", json={"status": "Completed"})
        assert business.workers.records[0]["status"] == "Deployed"
        await client.delete(f"/api/admin/assignments/{second['id']}")
        assert business.workers.records[0]["status"] == "Available"
        assert (await client.patch(f"/api/admin/workers/{worker_id}", json={"status": "Archived"})).status_code == 200
        assert (await client.delete(f"/api/admin/talents/{worker_id}")).status_code == 409
        assert len(business.workers.records) == 1
        business.workers.records[0]["source"] = "Website Application"
        assert (await client.delete(f"/api/admin/workers/{worker_id}")).status_code == 409


@pytest.mark.asyncio
async def test_employee_ids_are_unique_within_company_on_create_and_edit(business):
    async with session() as client:
        await client.post("/api/admin/login", json={"pin": "123456"})
        a, b = await company(client), await company(client, "Second Factory")
        data = {"full_name": "First Employee", "client_id": a["id"], "employee_id": "EX-001"}
        assert (await client.post("/api/admin/assignments", json=data)).status_code == 200
        assert (await client.post("/api/admin/assignments", json={**data, "full_name": "Second Employee", "employee_id": " ex-001 "})).status_code == 409
        second = (await client.post("/api/admin/assignments", json={**data, "full_name": "Second Employee", "employee_id": "EX-002"})).json()
        assert (await client.patch(f"/api/admin/assignments/{second['id']}", json={"employee_id": "ex-001"})).status_code == 409
        assert (await client.post("/api/admin/assignments", json={**data, "client_id": b["id"]})).status_code == 200
        assert len(business.workers.records) == len(business.assignments.records) == 3


@pytest.mark.asyncio
async def test_invoice_company_delete_restore_billing_and_financial_history(business):
    async with session() as client:
        assert (await client.delete(f"/api/admin/invoices/companies/{uuid4()}")).status_code == 401
        await client.post("/api/admin/login", json={"pin": "123456"})
        c = await company(client)
        assignment = (await client.post("/api/admin/assignments", json={"client_id": c["id"], "full_name": "Example Employee"})).json()
        update = await client.patch(f"/api/admin/invoices/companies/{c['id']}", json={"name": "Renamed Factory", "address": "Private billing address", "gstin": "29EXAMPLE"})
        assert update.status_code == 200, update.text
        assert (await client.get("/api/admin/clients")).json()[0]["billing_address"] == "Private billing address"
        invoice = (await client.post("/api/admin/invoices", json={**invoice_payload(), "company_id": c["id"], "client_name": "Renamed Factory"})).json()
        before = copy.deepcopy(business.invoices.records)
        assert (await client.delete(f"/api/admin/invoices/companies/{c['id']}")).status_code == 200
        assert (await client.get("/api/admin/invoices/companies")).json() == []
        assert (await client.get("/api/admin/clients")).json() == []
        assert (await client.get("/api/admin/assignments")).json() == []
        assert len(business.assignments.records) == 1
        assert business.workers.records[0]["status"] == "Available"
        assert (await client.get(f"/api/admin/invoices/{invoice['id']}")).json()["id"] == invoice["id"]
        assert (await client.get("/api/admin/clients?archived=true")).json()[0]["id"] == c["id"]
        assert (await client.post(f"/api/admin/clients/{c['id']}/restore")).status_code == 200
        assert (await client.get("/api/admin/assignments")).json()[0]["id"] == assignment["id"]
        assert business.workers.records[0]["status"] == "Deployed"
        assert business.invoices.records == before


@pytest.mark.asyncio
async def test_legacy_reconciliation_matches_name_and_phone_and_is_repeatable(business):
    business.clients.records = [{"id": "factory", "name": "Example Factory"}]
    existing = Worker(full_name="Example Employee", mobile="9876543210", current_location="Mysore", skill_category="Skilled").model_dump()
    business.workers.records = [existing]
    business.assignments.records = [
        {"id": "legacy1", "client_id": "factory", "full_name": "Example Employee", "mobile": "+91 98765 43210", "status": "Active"},
        {"id": "legacy2", "client_id": "factory", "full_name": "Another Employee", "mobile": "9876543210", "status": "Completed"},
    ]
    first = await reconcile_workforce(business)
    second = await reconcile_workforce(business)
    assert first == {"linked": 2, "created": 1} and second == {"linked": 0, "created": 0}
    assert len(business.workers.records) == 2
    assert business.assignments.records[0]["worker_id"] == existing["id"]
    assert business.assignments.records[1]["worker_id"] != existing["id"]
    assert business.workers.records[0]["current_location"] == "Mysore"


@pytest.mark.asyncio
async def test_employer_request_receipt_retry_and_payload_conflict(business):
    async with session() as client:
        data = {"request_id": str(uuid4()), "company_name": "Example Factory", "contact_person": "Example Contact", "mobile": "9876543210", "company_location": "Mysore", "job_role": "Assembler", "worker_count": "5"}
        first = await client.post("/api/company-requests", json=data)
        assert first.status_code == 200, first.text
        assert first.json()["reference"].startswith("BWS-ENQ-")
        assert (await client.post("/api/company-requests", json=data)).json() == first.json()
        assert (await client.post("/api/company-requests", json={**data, "worker_count": "6"})).status_code == 409
        assert len(business.company_requests.records) == 1


@pytest.mark.asyncio
async def test_staff_roles_and_revocation(business):
    async with session() as owner, session() as operator, session() as viewer:
        await owner.post("/api/admin/login", json={"pin": "123456"})
        op = (await owner.post("/api/admin/team", json={"name": "Example Operator", "username": "example.operator", "pin": "12345678", "role": "operator"})).json()
        view = await owner.post("/api/admin/team", json={"name": "Example Viewer", "username": "example.viewer", "pin": "12345678", "role": "viewer"})
        assert view.status_code == 200
        assert "pin" not in op and "pin_hash" not in op
        assert (await operator.post("/api/admin/login", json={"username": op["username"], "pin": "12345678"})).status_code == 200
        assert (await viewer.post("/api/admin/login", json={"username": "example.viewer", "pin": "12345678"})).status_code == 200
        assert (await operator.get("/api/admin/me")).json()["name"] == "Example Operator"
        for client in (operator, viewer):
            assert (await client.get("/api/admin/backups/download")).status_code == 403
            assert (await client.get("/api/admin/team")).status_code == 403
            assert (await client.post("/api/admin/security/pin", json={"new_pin": "87654321"})).status_code == 403
        assert (await operator.post("/api/admin/clients", json={"name": "Operator Factory", "visible": False})).status_code == 200
        assert (await viewer.get("/api/admin/clients")).status_code == 200
        assert (await viewer.post("/api/admin/clients", json={"name": "Viewer Factory"})).status_code == 403
        await owner.patch(f"/api/admin/team/{op['id']}", json={"disabled": True})
        assert (await operator.get("/api/admin/me")).status_code == 401
        assert (await operator.post("/api/admin/login", json={"username": op["username"], "pin": "12345678"})).status_code == 401


@pytest.mark.asyncio
async def test_backup_preview_additive_restore_and_no_credentials(business):
    async with session() as client:
        assert (await client.get("/api/admin/backups/download")).status_code == 401
        await client.post("/api/admin/login", json={"pin": "123456"})
        c = await company(client)
        person = (await client.post("/api/admin/assignments", json={"client_id": c["id"], "full_name": "Example Employee"})).json()
        bill = await client.post("/api/admin/invoices", json={**invoice_payload(), "company_id": c["id"]})
        assert bill.status_code == 200
        before = copy.deepcopy(business.invoices.records)
        response = await client.get("/api/admin/backups/download")
        assert response.status_code == 200, response.text[:300] if response.status_code != 200 else ""
        with ZipFile(io.BytesIO(response.content)) as archive:
            assert b"pin_hash" not in archive.read("settings.json")
            assert b"token_hash" not in b"".join(archive.read(n) for n in archive.namelist())
        await business.workers.delete_one({"id": person["worker_id"]})
        files = {"file": ("backup.zip", response.content, "application/zip")}
        preview = await client.post("/api/admin/backups/inspect", files=files)
        assert preview.status_code == 200, preview.text
        assert preview.json()["counts"]["workers"]["new"] == 1
        assert (await client.post("/api/admin/backups/restore", files=files, data={"sha256": "incorrect"})).status_code == 409
        restored = await client.post("/api/admin/backups/restore", files=files, data={"sha256": preview.json()["sha256"]})
        assert restored.status_code == 200, restored.text
        assert restored.json()["added"] == 1
        assert len(business.workers.records) == 1
        assert business.invoices.records == before
        repeated = await client.post("/api/admin/backups/restore", files=files, data={"sha256": preview.json()["sha256"]})
        assert repeated.status_code == 200 and repeated.json()["added"] == 0
        assert (await client.post("/api/admin/backups/inspect", files={"file": ("bad.zip", b"not a backup")})).status_code == 422


@pytest.mark.asyncio
async def test_public_company_cards_exclude_billing_information(business):
    async with session() as client:
        await client.post("/api/admin/login", json={"pin": "123456"})
        await client.post("/api/admin/clients", json={"name": "Approved Public Client", "billing_address": "Private billing desk", "gstin": "29PRIVATE", "visible": True})
        row = (await client.get("/api/clients")).json()[0]
        assert "billing_address" not in row and "gstin" not in row


@pytest.mark.asyncio
async def test_invoice_only_legacy_companies_join_the_shared_directory(business):
    company_id = str(uuid4())
    business.invoice_companies.records = [{"id": company_id, "name": "Legacy Factory", "address": "Billing office", "gstin": "29EXAMPLE"}]
    await reconcile_companies(business)
    await reconcile_companies(business)
    assert len(business.clients.records) == 1
    assert business.clients.records[0]["id"] == company_id
    assert business.clients.records[0]["visible"] is False
    async with session() as client:
        await client.post("/api/admin/login", json={"pin": "123456"})
        assert (await client.get("/api/admin/clients")).json()[0]["gstin"] == "29EXAMPLE"
        assert (await client.get("/api/admin/payroll/companies")).json()[0]["id"] == company_id


@pytest.mark.asyncio
async def test_response_target_requires_owner_and_is_public_only_after_setting(business):
    async with session() as client:
        assert (await client.get("/api/service-info")).json() == {"enquiry_response_target": ""}
        assert (await client.put("/api/admin/service-info", json={"enquiry_response_target": "Example agreed timeframe"})).status_code == 401
        await client.post("/api/admin/login", json={"pin": "123456"})
        response = await client.put("/api/admin/service-info", json={"enquiry_response_target": "Example agreed timeframe"})
        assert response.status_code == 200, response.text
        assert (await client.get("/api/service-info")).json()["enquiry_response_target"] == "Example agreed timeframe"

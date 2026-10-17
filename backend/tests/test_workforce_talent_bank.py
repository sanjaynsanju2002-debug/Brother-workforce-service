"""Workforce additions share persisted profiles with Talent Bank."""

import copy
import os

import httpx
import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "bws_workforce_talent_test")

from lib import auth
from models.bws import Worker
from routers import admin, assignments
from server import app
from tests.test_admin_session_and_application import FakeDB
from tests.test_assignment_employee_ids import AssignmentCollection
from tests.test_invoices import InvoiceCollection


@pytest.fixture
def workforce_db(monkeypatch):
    fake = FakeDB()
    fake.clients = InvoiceCollection()
    fake.clients.records = [
        {"id": "company-a", "name": "Factory A", "location": "Mysuru"},
        {"id": "company-b", "name": "Factory B"},
    ]
    fake.assignments = AssignmentCollection()
    fake.workers = InvoiceCollection()
    for module in (auth, admin, assignments):
        monkeypatch.setattr(module, "db", fake)
    return fake


def employee(**changes):
    return {
        "client_id": "company-a", "full_name": "  Example Employee  ",
        "mobile": "+91 98765 43210", "role": "Machine operator",
        "employee_id": "BWS-001", "salary": "16000", **changes,
    }


@pytest.mark.asyncio
async def test_manual_employee_appears_in_talent_bank_and_export(workforce_db):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://test.invalid") as client:
        assert (await client.post("/api/admin/assignments", json=employee())).status_code == 401
        assert not workforce_db.workers.records
        await client.post("/api/admin/login", json={"pin": "123456"})
        response = await client.post("/api/admin/assignments", json=employee())
        assert response.status_code == 200, response.text
        assignment = response.json()
        talent = (await client.get("/api/admin/talents")).json()[0]
        assert assignment["worker_id"] == talent["id"]
        assert talent["full_name"] == "Example Employee"
        assert talent["mobile"] == "+91 98765 43210"
        assert talent["skills"] == "Machine operator"
        assert talent["status"] == "Deployed"
        assert talent["source"] == "Talent Bank"
        assert talent["current_location"] == talent["skill_category"] == "Not provided"
        assert talent["expected_salary"] is None
        assert talent["consent_to_share"] is False
        assert "Example Employee" in (await client.get("/api/admin/export/talents.csv")).text
        assert len(workforce_db.workers.records) == 1


@pytest.mark.asyncio
async def test_manual_retry_reuses_profile_and_rejects_duplicate_active_assignment(workforce_db):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://test.invalid") as client:
        await client.post("/api/admin/login", json={"pin": "123456"})
        first = (await client.post("/api/admin/assignments", json=employee())).json()
        retry = employee(full_name="example   employee", mobile="9876543210")
        assert (await client.post("/api/admin/assignments", json=retry)).status_code == 409
        second = await client.post("/api/admin/assignments", json={**retry, "client_id": "company-b"})
        assert second.status_code == 200, second.text
        assert second.json()["worker_id"] == first["worker_id"]
        assert len(workforce_db.workers.records) == 1
        assert len(workforce_db.assignments.records) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("select_existing", [False, True])
async def test_existing_profiles_are_reused_without_overwriting_candidate_details(workforce_db, select_existing):
    original = Worker(
        full_name="Example Employee", mobile="9876543210", current_location="Bengaluru",
        skill_category="Skilled", skills="Electrical maintenance", consent_to_share=True,
        resume_filename="candidate.pdf", source="Website Application", status="Shortlisted",
    ).model_dump()
    await workforce_db.workers.insert_one(original)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://test.invalid") as client:
        await client.post("/api/admin/login", json={"pin": "123456"})
        data = employee(**({"worker_id": original["id"]} if select_existing else {}))
        response = await client.post("/api/admin/assignments", json=data)
        assert response.status_code == 200, response.text
        assert response.json()["worker_id"] == original["id"]
        assert workforce_db.workers.records == [original]
        assert len((await client.get("/api/admin/talents")).json()) == 1


@pytest.mark.asyncio
async def test_shared_phones_and_missing_mobile_do_not_merge_different_people(workforce_db):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://test.invalid") as client:
        await client.post("/api/admin/login", json={"pin": "123456"})
        for data in [employee(), employee(full_name="Another Employee"), employee(mobile=None), employee(mobile="")]:
            response = await client.post("/api/admin/assignments", json=data)
            assert response.status_code == 200, response.text
        assert len(workforce_db.workers.records) == 4
        assert len({row["worker_id"] for row in workforce_db.assignments.records}) == 4


@pytest.mark.asyncio
async def test_validation_and_failed_assignment_do_not_leave_orphan_profiles(workforce_db, monkeypatch):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url="https://test.invalid") as client:
        await client.post("/api/admin/login", json={"pin": "123456"})
        for changes, status in [({"client_id": "missing"}, 404), ({"worker_id": "missing"}, 404), ({"full_name": " "}, 400)]:
            assert (await client.post("/api/admin/assignments", json=employee(**changes))).status_code == status
        assert not workforce_db.workers.records

        async def fail_save(record):
            raise RuntimeError("Simulated assignment storage failure")

        monkeypatch.setattr(workforce_db.assignments, "insert_one", fail_save)
        assert (await client.post("/api/admin/assignments", json=employee())).status_code == 500
        assert not workforce_db.workers.records
        assert not workforce_db.assignments.records

        original = Worker(full_name="Example Employee", mobile="9876543210", current_location="Mysuru", skill_category="Skilled").model_dump()
        await workforce_db.workers.insert_one(copy.deepcopy(original))
        assert (await client.post("/api/admin/assignments", json=employee(worker_id=original["id"]))).status_code == 500
        assert workforce_db.workers.records == [original]

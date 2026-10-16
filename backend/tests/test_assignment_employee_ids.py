"""Employee IDs persist on private workforce records, including older assignments."""

import copy
import os

import httpx
import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "bws_assignment_test")

from lib import auth
from routers import assignments
from server import app
from tests.test_admin_session_and_application import FakeDB
from tests.test_invoices import InvoiceCollection


class AssignmentCollection(InvoiceCollection):
    async def find_one_and_update(self, query, changes, **kwargs):
        row = next((row for row in self.records if self.matches(row, query)), None)
        if row is None:
            return None
        row.update(copy.deepcopy(changes["$set"]))
        return copy.deepcopy(row)


@pytest.mark.asyncio
async def test_employee_id_create_edit_clear_and_legacy_records(monkeypatch):
    fake = FakeDB()
    fake.clients = InvoiceCollection()
    fake.assignments = AssignmentCollection()
    await fake.clients.insert_one({"id": "company-a", "name": "Factory A"})
    await fake.clients.insert_one({"id": "company-b", "name": "Factory B"})
    monkeypatch.setattr(auth, "db", fake)
    monkeypatch.setattr(assignments, "db", fake)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://brothersworkforcesolutions.in") as client:
        data = {"client_id": "company-a", "full_name": "Example Worker", "employee_id": "  001-A  ", "role": "Operator"}
        assert (await client.post("/api/admin/assignments", json=data)).status_code == 401
        assert (await client.patch("/api/admin/assignments/missing", json={"employee_id": "001-A"})).status_code == 401
        await client.post("/api/admin/login", json={"pin": "123456"})
        result = await client.post("/api/admin/assignments", json=data)
        assert result.status_code == 200, result.text
        original = result.json()
        assert original["employee_id"] == "001-A"
        path = f"/api/admin/assignments/{original['id']}"
        updated = await client.patch(path, json={"employee_id": " BWS-0007 "})
        assert updated.status_code == 200, updated.text
        updated = updated.json()
        assert updated["employee_id"] == "BWS-0007"
        for key in original.keys() - {"employee_id"}:
            assert updated[key] == original[key]
        assert (await client.get("/api/admin/assignments")).json()[0]["employee_id"] == "BWS-0007"
        completed = (await client.patch(path, json={"status": "Completed"})).json()
        assert completed["employee_id"] == "BWS-0007"
        assert completed["status"] == "Completed"
        assert (await client.patch(path, json={"employee_id": "  "})).json()["employee_id"] is None
        assert (await client.patch(path, json={"employee_id": "X" * 81})).status_code == 422
        assert (await client.post("/api/admin/assignments", json={**data, "employee_id": "X" * 81})).status_code == 422
        assert (await client.patch(path, json={"status": None})).status_code == 422
        assert (await client.patch(path, json={})).status_code == 422
        assert (await client.patch("/api/admin/assignments/missing", json={"employee_id": "007"})).status_code == 404
        legacy = {**copy.deepcopy(fake.assignments.records[0]), "id": "legacy-assignment", "client_id": "company-b", "company_name": "Factory B"}
        legacy.pop("employee_id")
        await fake.assignments.insert_one(legacy)
        rows = (await client.get("/api/admin/assignments")).json()
        assert next(row for row in rows if row["id"] == "legacy-assignment")["employee_id"] is None
        edited_legacy = (await client.patch("/api/admin/assignments/legacy-assignment", json={"employee_id": "0009"})).json()
        assert edited_legacy["employee_id"] == "0009"
        assert edited_legacy["company_name"] == "Factory B"
        assert next(row for row in fake.assignments.records if row["id"] == original["id"])["employee_id"] is None

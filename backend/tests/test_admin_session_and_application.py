"""Regression tests for the public application and admin session boundary."""

import hashlib
import os

import httpx
import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "bws_test")

from lib import auth  # noqa: E402
from routers import public  # noqa: E402
from server import app  # noqa: E402


class Collection:
    def __init__(self, records=None):
        self.records = list(records or [])

    async def find_one(self, query, projection=None):
        def matches(record, conditions):
            for key, value in conditions.items():
                if key == "$or":
                    if not any(matches(record, item) for item in value):
                        return False
                elif isinstance(value, dict):
                    if "$exists" in value and (key in record) != value["$exists"]:
                        return False
                    if "$gte" in value and (record.get(key) is None or record[key] < value["$gte"]):
                        return False
                    if "$gt" in value and (record.get(key) is None or record[key] <= value["$gt"]):
                        return False
                elif record.get(key) != value:
                    return False
            return True

        for record in self.records:
            if matches(record, query):
                return record.copy()
        return None

    async def insert_one(self, record):
        self.records.append(record.copy())

    async def update_one(self, query, changes, upsert=False):
        record = await self.find_one(query)
        if record is None:
            if not upsert:
                return
            record = query.copy()
            self.records.append(record)
        else:
            record = next(row for row in self.records if row.get("id") == record.get("id"))
        for key, value in changes.get("$set", {}).items():
            record[key] = value
        for key in changes.get("$unset", {}):
            record.pop(key, None)
        for key, value in changes.get("$inc", {}).items():
            record[key] = record.get(key, 0) + value

    async def delete_one(self, query):
        self.records = [record for record in self.records if not all(record.get(k) == v for k, v in query.items())]

    async def delete_many(self, query):
        def matches(record):
            return all(
                record.get(key) == value or
                (isinstance(value, dict) and "$lte" in value and record.get(key) <= value["$lte"])
                for key, value in query.items()
            )
        self.records = [record for record in self.records if not matches(record)]


class FakeDB:
    def __init__(self):
        self.settings = Collection([{"id": "admin", "pin": "123456"}])
        self.admin_login_attempts = Collection()
        self.admin_sessions = Collection()
        self.jobs = Collection([{
            "id": "job-1", "title": "Machine Operator", "location": "Mysuru",
            "skill_category": "Skilled", "active": True,
        }, {
            "id": "expired", "title": "Expired role", "location": "Mysuru",
            "skill_category": "Skilled", "active": True, "closing_date": "2020-01-01",
        }])
        self.workers = Collection()


@pytest.mark.asyncio
async def test_admin_pin_migrates_to_hash_and_cookie_controls_access(monkeypatch):
    fake = FakeDB()
    monkeypatch.setattr(auth, "db", fake)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="https://brothersworkforcesolutions.in") as client:
        assert (await client.get("/api/admin/me")).status_code == 401
        assert (await client.get("/api/admin/jobs?pin=123456")).status_code == 401
        assert (await client.post("/api/admin/login", json={"pin": "wrong"})).status_code == 401

        login = await client.post("/api/admin/login", json={"pin": "123456"})
        assert login.status_code == 200
        assert "HttpOnly" in login.headers["set-cookie"]
        assert "Secure" in login.headers["set-cookie"]
        assert "SameSite=strict" in login.headers["set-cookie"]
        assert fake.settings.records[0].get("pin") is None
        assert fake.settings.records[0]["pin_hash"] != "123456"
        assert hashlib.sha256(client.cookies.get("bws_admin_session").encode()).hexdigest() == fake.admin_sessions.records[0]["token_hash"]
        assert (await client.get("/api/admin/me")).status_code == 200

        blocked = await client.post(
            "/api/admin/security/pin", json={"new_pin": "98765432"},
            headers={"Origin": "https://another.example"},
        )
        assert blocked.status_code == 403
        assert (await client.post("/api/admin/logout")).status_code == 200
        assert (await client.get("/api/admin/me")).status_code == 401


@pytest.mark.asyncio
async def test_job_application_requires_consent_and_records_selected_role(monkeypatch):
    fake = FakeDB()
    monkeypatch.setattr(public, "db", fake)

    async def no_email(*args, **kwargs):
        pass

    monkeypatch.setattr(public, "send_notification", no_email)
    payload = {
        "full_name": "Example Applicant", "mobile": "9999999999",
        "current_location": "Mysuru", "skill_category": "Skilled", "job_id": "job-1",
    }
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="https://brothersworkforcesolutions.in") as client:
        assert (await client.post("/api/workers", json=payload)).status_code == 400
        assert (await client.get("/api/jobs/job-1")).status_code == 200
        submitted = await client.post("/api/workers", json={**payload, "consent_to_share": True})
        assert submitted.status_code == 200
        assert submitted.json()["job_title"] == "Machine Operator"
        assert fake.workers.records[0]["job_id"] == "job-1"
        assert (await client.post("/api/workers", json={**payload, "job_id": "closed", "consent_to_share": True})).status_code == 404
        assert (await client.get("/api/jobs/expired")).status_code == 404
        assert (await client.post("/api/workers", json={**payload, "job_id": "expired", "consent_to_share": True})).status_code == 404
        assert len(fake.workers.records) == 1

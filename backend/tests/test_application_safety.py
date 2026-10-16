"""Applicant retries cannot create duplicates or overwrite another resume."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import httpx
import pytest

from lib import auth
from routers import public
from server import app
from tests.test_admin_session_and_application import Collection, FakeDB


@pytest.mark.asyncio
async def test_application_reference_idempotency_and_authorized_upload(monkeypatch):
    fake = FakeDB()
    fake.resume_files = Collection()
    monkeypatch.setattr(public, "db", fake)
    monkeypatch.setattr(auth, "db", fake)
    monkeypatch.setattr(public, "R2_BUCKET", "")
    async def no_email(*args, **kwargs):
        pass
    monkeypatch.setattr(public, "send_notification", no_email)
    data = {"request_id": str(uuid4()), "full_name": "  Test Applicant  ", "mobile": "+91 96063 33542", "current_location": "Mysuru", "skill_category": "Skilled", "consent_to_share": True, "job_id": "job-1"}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://brothersworkforcesolutions.in") as client:
        response = await client.post("/api/workers", json=data)
        assert response.status_code == 200, response.text
        receipt = response.json()
        assert receipt["full_name"] == "Test Applicant" and receipt["mobile"] == "9606333542"
        assert receipt["application_reference"].startswith("BWS-")
        assert "upload_token_hash" not in receipt and "submission_hash" not in receipt
        again = await client.post("/api/workers", json=data)
        assert again.status_code == 200 and again.json()["id"] == receipt["id"]
        assert len(fake.workers.records) == 1
        assert (await client.post("/api/workers", json={**data, "request_id": str(uuid4())})).status_code == 409
        assert (await client.post("/api/workers", json={**data, "full_name": "Different person"})).status_code == 409
        path = f"/api/workers/{receipt['id']}/resume"
        file = {"file": ("resume.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")}
        assert (await client.post(path, files=file)).status_code == 403
        assert (await client.post(path, files=file, headers={"X-Upload-Token": "wrong"})).status_code == 403
        result = await client.post(path, files=file, headers={"X-Upload-Token": receipt["upload_token"]})
        assert result.status_code == 200 and result.json()["resume_filename"] == "resume.pdf"
        assert len(fake.workers.records) == 1
        assert bytes(fake.resume_files.records[0]["data"]) == file["file"][1]
        assert (await client.post(path, files={"file": ("empty.pdf", b"", "application/pdf")}, headers={"X-Upload-Token": receipt["upload_token"]})).status_code == 422
        assert (await client.post(path, files={"file": ("large.pdf", b"x" * (2 * 1024 * 1024 + 1), "application/pdf")}, headers={"X-Upload-Token": receipt["upload_token"]})).status_code == 413
        fake.workers.records[0]["upload_expires_at"] = datetime.now(timezone.utc) - timedelta(seconds=1)
        assert (await client.post(path, files=file, headers={"X-Upload-Token": receipt["upload_token"]})).status_code == 403
        await client.post("/api/admin/login", json={"pin": "123456"})
        assert (await client.post(path, files=file)).status_code == 200


@pytest.mark.asyncio
async def test_public_fields_validate_without_writing_bad_records(monkeypatch):
    fake = FakeDB()
    monkeypatch.setattr(public, "db", fake)
    async def no_email(*args, **kwargs):
        pass
    monkeypatch.setattr(public, "send_notification", no_email)
    data = {"full_name": "Applicant", "mobile": "9999999999", "current_location": "Mysore", "skill_category": "Skilled", "consent_to_share": True}
    company = {"company_name": "Factory", "contact_person": "Manager", "mobile": "+91 96063 33542", "company_location": "Mysore", "job_role": "Operator", "worker_count": "5"}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://brothersworkforcesolutions.in") as client:
        for change in ({"mobile": "123"}, {"full_name": " "}, {"current_location": " "}, {"skill_category": "Invalid"}):
            assert (await client.post("/api/workers", json={**data, **change})).status_code == 422
        assert not fake.workers.records
        for change in ({"mobile": "123"}, {"company_name": " "}, {"worker_count": "0"}, {"worker_count": "1.5"}):
            assert (await client.post("/api/company-requests", json={**company, **change})).status_code == 422
        created = await client.post("/api/company-requests", json=company)
        assert created.status_code == 200 and created.json()["mobile"] == "9606333542"

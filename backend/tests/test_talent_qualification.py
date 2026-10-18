"""Qualifications are shared candidate data and may be edited without altering a roster."""

import copy
import csv
import io
from zipfile import ZIP_DEFLATED, ZipFile

import pytest

from tests.test_site_improvements import business, company, session


@pytest.mark.asyncio
async def test_qualification_edit_preserves_active_assignment_and_other_candidate_details(business):
    async with session() as client:
        assert (await client.patch("/api/admin/talents/missing/qualification", json={"education": "ITI"})).status_code == 401
        await client.post("/api/admin/login", json={"pin": "123456"})
        created = await client.post("/api/admin/talents", json={"full_name": "Example Candidate", "mobile": "9876543210", "current_location": "Mysuru", "skill_category": "Skilled", "education": "SSLC", "skills": "Fitting"})
        assert created.status_code == 200, created.text
        talent = created.json()
        c = await company(client)
        assignment = await client.post("/api/admin/assignments", json={"client_id": c["id"], "worker_id": talent["id"], "full_name": talent["full_name"]})
        assert assignment.status_code == 200
        before = copy.deepcopy(business.workers.records[0])
        roster_before = copy.deepcopy(business.assignments.records)
        response = await client.patch(f"/api/admin/talents/{talent['id']}/qualification", json={"education": "  ITI - Fitter  "})
        assert response.status_code == 200, response.text
        assert response.json()["education"] == "ITI - Fitter"
        assert business.workers.records == [{**before, "education": "ITI - Fitter"}]
        assert business.assignments.records == roster_before
        assert response.json()["status"] == "Deployed"
        assert (await client.get("/api/admin/talents")).json()[0]["education"] == "ITI - Fitter"
        rows = list(csv.DictReader(io.StringIO((await client.get("/api/admin/export/talents.csv")).text)))
        assert rows[0]["Qualification"] == "ITI - Fitter"


@pytest.mark.asyncio
async def test_qualification_validation_clear_missing_and_view_only_access(business):
    async with session() as client, session() as viewer:
        await client.post("/api/admin/login", json={"pin": "123456"})
        talent = (await client.post("/api/admin/talents", json={"full_name": "Example Candidate", "mobile": "9876543210", "current_location": "Mysuru", "skill_category": "Skilled"})).json()
        path = f"/api/admin/talents/{talent['id']}/qualification"
        assert (await client.patch(path, json={})).status_code == 422
        assert (await client.patch(path, json={"education": "X" * 501})).status_code == 422
        assert (await client.patch(path, json={"education": "ITI", "status": "Available"})).status_code == 422
        for value in ("", "   ", None):
            response = await client.patch(path, json={"education": value})
            assert response.status_code == 200 and response.json()["education"] is None
        assert (await client.patch("/api/admin/talents/missing/qualification", json={"education": "PUC"})).status_code == 404
        await client.post("/api/admin/team", json={"name": "Example Viewer", "username": "qualification.viewer", "pin": "12345678", "role": "viewer"})
        assert (await viewer.post("/api/admin/login", json={"username": "qualification.viewer", "pin": "12345678"})).status_code == 200
        assert (await viewer.patch(path, json={"education": "Degree"})).status_code == 403
        assert business.workers.records[0]["education"] is None


@pytest.mark.asyncio
async def test_import_accepts_new_qualification_and_legacy_education_columns(business, monkeypatch):
    from routers import admin
    monkeypatch.setattr(admin, "_r2_client", lambda: None)
    archive_bytes = io.BytesIO()
    with ZipFile(archive_bytes, "w", ZIP_DEFLATED) as archive:
        archive.writestr("talents.csv", "full_name,mobile,current_location,qualification,education\nExample ITI,9876543210,Mysuru,ITI - Fitter,\nExample Diploma,9876543211,Mysuru,,Diploma - Mechanical\n")
    async with session() as client:
        await client.post("/api/admin/login", json={"pin": "123456"})
        result = await client.post("/api/admin/talents/import", files={"file": ("talents.zip", archive_bytes.getvalue(), "application/zip")})
        assert result.status_code == 200, result.text
        assert result.json()["imported"] == 2
        assert {row["education"] for row in business.workers.records} == {"ITI - Fitter", "Diploma - Mechanical"}

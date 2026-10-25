"""The private browser applications must remain directly addressable."""

import os

import httpx
import pytest
from fastapi import FastAPI

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "bws_test")

from lib.frontend import mount_frontend


@pytest.mark.asyncio
async def test_attendance_route_serves_spa_and_stays_private(tmp_path):
    (tmp_path / "index.html").write_text("<html><title>Attendance shell</title></html>", encoding="utf-8")
    application = FastAPI()
    mount_frontend(application, tmp_path)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=application),
        base_url="https://brothersworkforcesolutions.in",
    ) as client:
        for path in ("/attendance", "/attendance/"):
            response = await client.get(path)
            assert response.status_code == 200
            assert "Attendance shell" in response.text
            assert response.headers["cache-control"] == "private, no-store"

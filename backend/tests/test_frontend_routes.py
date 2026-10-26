"""Private tools must not be mounted into the public website."""

import os

import httpx
import pytest
from fastapi import FastAPI

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "bws_test")

from lib.frontend import mount_frontend


@pytest.mark.asyncio
async def test_attendance_route_is_not_part_of_the_main_website(tmp_path):
    (tmp_path / "index.html").write_text("<html><title>Public website</title></html>", encoding="utf-8")
    application = FastAPI()
    mount_frontend(application, tmp_path)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=application),
        base_url="https://brothersworkforcesolutions.in",
    ) as client:
        assert (await client.get("/attendance")).status_code == 404
        assert (await client.get("/attendance/")).status_code == 404

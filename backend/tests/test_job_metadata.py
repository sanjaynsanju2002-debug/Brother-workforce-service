"""Only verified, complete job pages receive recruitment structured data."""

import os
from datetime import datetime, timezone

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "bws_test")

from lib.frontend import _job_schema
from lib.jobs import open_jobs_query


def test_schema_requires_full_description_and_named_employer():
    job = {
        "title": "Assembler", "location": "Mysuru", "created_at": datetime(2026, 10, 13, tzinfo=timezone.utc),
        "description": "Responsibilities: Assemble components and inspect completed units. "
                       "Qualifications: Experience with hand tools and attention to detail. "
                       "Working hours: 9am to 5pm at the facility.",
        "employer_name": "Example Manufacturing Ltd",
    }
    url = "https://brothersworkforcesolutions.in/jobs/example"
    assert '"@type": "JobPosting"' in _job_schema(job, url)
    assert "Example Manufacturing Ltd" in _job_schema(job, url)
    assert _job_schema({**job, "employer_name": ""}, url) == ""
    assert _job_schema({**job, "description": "Assembler opening"}, url) == ""


def test_open_job_query_includes_undated_jobs_and_excludes_past_dates():
    query = open_jobs_query()
    assert query["active"] is True
    closing_dates = [item["closing_date"] for item in query["$or"]]
    assert {"$exists": False} in closing_dates
    assert None in closing_dates
    assert closing_dates[-1]["$gte"] > "2020-01-01"

"""Only verified, complete job pages receive recruitment structured data."""

import os
from datetime import datetime, timezone

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "bws_test")

from lib.frontend import _job_schema
from lib.jobs import open_jobs_query
from models.bws import JobCreate
from pydantic import ValidationError
import pytest


def test_schema_requires_full_description_and_named_employer():
    job = {
        "title": "Assembler", "location": "Mysuru", "created_at": datetime(2026, 10, 13, tzinfo=timezone.utc),
        "description": "Responsibilities: Assemble components and inspect completed units. "
                       "Qualifications: Experience with hand tools and attention to detail. "
                       "Working hours: 9am to 5pm at the facility.",
        "employer_name": "Example Manufacturing Ltd", "schema_ready": True,
        "qualification": "Experience with hand tools", "working_hours": "9am to 5pm",
    }
    url = "https://brothersworkforcesolutions.in/jobs/example"
    assert '"@type": "JobPosting"' in _job_schema(job, url)
    assert "Example Manufacturing Ltd" in _job_schema(job, url)
    assert _job_schema({**job, "schema_ready": False}, url) == ""
    assert _job_schema({**job, "working_hours": ""}, url) == ""
    assert _job_schema({**job, "employer_name": ""}, url) == ""
    assert _job_schema({**job, "description": "Assembler opening"}, url) == ""


def test_open_job_query_includes_undated_jobs_and_excludes_past_dates():
    query = open_jobs_query()
    assert query["active"] is True
    closing_dates = [item["closing_date"] for item in query["$or"]]
    assert {"$exists": False} in closing_dates
    assert None in closing_dates
    assert closing_dates[-1]["$gte"] > "2020-01-01"


def verified_job(**changes):
    return {"title": "Assembler", "location": "Mysore", "skill_category": "General Worker", "openings": 20,
            "description": "Assemble components according to work instructions and inspect completed units for quality. " * 2,
            "qualification": "Discuss during screening", "working_hours": "8 hours/day", "employer_name": "Example company",
            "schema_ready": True, **changes}


@pytest.mark.parametrize("changes,missing", [
    ({"employer_name": ""}, "hiring company"),
    ({"working_hours": " "}, "working hours / days"),
    ({"qualification": None}, "qualification / eligibility"),
    ({"description": "Brief role"}, "full job description (at least 100 characters)"),
])
def test_verified_job_errors_name_the_actual_missing_detail(changes, missing):
    with pytest.raises(ValidationError) as error:
        JobCreate(**verified_job(**changes))
    assert missing in str(error.value)
    assert "turn off job search verification" in str(error.value)


def test_confidential_employer_does_not_block_saving_a_website_job():
    job = JobCreate(**verified_job(employer_name="", schema_ready=False))
    assert job.employer_name == "" and not job.schema_ready

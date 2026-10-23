"""Description backfill preserves owner content and all existing recruitment terms."""

import copy
import re
from types import SimpleNamespace

from lib.job_descriptions import JOB_DESCRIPTIONS, fill_missing_job_descriptions


class Jobs:
    def __init__(self, records):
        self.records = records

    @classmethod
    def matches(cls, doc, query):
        for field, expected in query.items():
            if field == "$or":
                if not any(cls.matches(doc, option) for option in expected):
                    return False
            elif isinstance(expected, dict) and "$regex" in expected:
                value = doc.get(field)
                if not isinstance(value, str) or not re.search(expected["$regex"], value, re.I if expected.get("$options") == "i" else 0):
                    return False
            elif doc.get(field) != expected:
                return False
        return True

    async def update_one(self, query, update):
        doc = next((doc for doc in self.records if self.matches(doc, query)), None)
        if doc is None:
            return SimpleNamespace(modified_count=0)
        before = copy.deepcopy(doc)
        doc.update(update["$set"])
        return SimpleNamespace(modified_count=int(before != doc))


def job(post, **changes):
    return {
        "id": post["id"], "title": post["title"], "location": "Mysore",
        "active": True, "openings": 5, "salary": "", "shift": "",
        "experience": "Fresher", "qualification": None, "working_hours": None,
        "benefits": None, "schema_ready": False, **changes,
    }


async def test_fills_all_three_missing_descriptions_without_changing_recruitment_terms():
    records = [job(JOB_DESCRIPTIONS[0], description=""), job(JOB_DESCRIPTIONS[1], description=None),
               job(JOB_DESCRIPTIONS[2], title="ITI graduate ", description=" \n\t", description_kn=" ")]
    before = copy.deepcopy(records)
    result = await fill_missing_job_descriptions(SimpleNamespace(jobs=Jobs(records)))
    assert result == {"descriptions_added": 3, "translations_added": 3}
    for original, saved in zip(before, records):
        assert "Responsibilities:" in saved["description"]
        assert "Candidate profile:" in saved["description"]
        assert "ಜವಾಬ್ದಾರಿಗಳು:" in saved["description_kn"]
        assert saved["updated_at"].tzinfo is not None
        for key, value in original.items():
            if key not in {"description", "description_kn"}:
                assert saved[key] == value


async def test_preserves_existing_descriptions_translations_and_unrelated_or_renamed_jobs():
    records = [
        job(JOB_DESCRIPTIONS[0], description="Owner's detailed duties", description_kn="ಮಾಲೀಕರ ವಿವರಗಳು"),
        job(JOB_DESCRIPTIONS[1], description="", description_kn="ಈಗಾಗಲೇ ಉಳಿಸಿದ ವಿವರಣೆ"),
        job(JOB_DESCRIPTIONS[2], description="Owner's ITI duties"),
        job(JOB_DESCRIPTIONS[0], id="another-job-with-the-same-title", description=""),
        job(JOB_DESCRIPTIONS[1], title="Changed to a different role", description=""),
    ]
    before = copy.deepcopy(records)
    result = await fill_missing_job_descriptions(SimpleNamespace(jobs=Jobs(records)))
    assert result == {"descriptions_added": 1, "translations_added": 0}
    assert records[0] == before[0]
    assert records[1]["description_kn"] == before[1]["description_kn"]
    assert records[2:] == before[2:]


async def test_retries_partial_backfill_and_never_overwrites_later_owner_edits():
    post = JOB_DESCRIPTIONS[0]
    records = [job(post, description=post["description"])]
    db = SimpleNamespace(jobs=Jobs(records))
    assert await fill_missing_job_descriptions(db) == {"descriptions_added": 0, "translations_added": 1}
    completed = copy.deepcopy(records)
    assert await fill_missing_job_descriptions(db) == {"descriptions_added": 0, "translations_added": 0}
    assert records == completed
    records[0].update(description="Updated by owner", description_kn="ಮಾಲೀಕರು ನವೀಕರಿಸಿದ ವಿವರಣೆ")
    edited = copy.deepcopy(records)
    assert await fill_missing_job_descriptions(db) == {"descriptions_added": 0, "translations_added": 0}
    assert records == edited

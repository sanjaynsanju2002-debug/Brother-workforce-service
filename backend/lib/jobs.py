"""Public job visibility uses the local hiring date in Karnataka."""
from datetime import datetime
from zoneinfo import ZoneInfo


def open_jobs_query() -> dict:
    today = datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()
    return {
        "active": True,
        "$or": [
            {"closing_date": {"$exists": False}},
            {"closing_date": None},
            {"closing_date": {"$gte": today}},
        ],
    }

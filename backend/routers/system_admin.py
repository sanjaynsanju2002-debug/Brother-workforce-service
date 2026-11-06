"""Owner-only operational diagnostics. Never return credentials or full connection URIs."""
import os
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit
from fastapi import APIRouter, Depends
from lib.auth import require_owner
from lib.db import db

router = APIRouter(prefix="/admin/system", dependencies=[Depends(require_owner)])


@router.get("/status")
async def system_status():
    host = urlsplit(os.environ.get("MONGO_URL", "")).hostname
    deliveries = await db.attendance_report_deliveries.find({}, {
        "_id": 0, "report_date": 1, "status": 1, "updated_at": 1,
    }).sort("updated_at", -1).limit(10).to_list(10)
    cutoff = datetime.now(timezone.utc) - timedelta(days=365)
    return {
        "database_host": host or "Not available", "database_name": os.environ.get("DB_NAME", ""),
        "job_ids": [d["id"] for d in await db.jobs.find({}, {"id": 1, "_id": 0}).to_list(1000)],
        "jobs_total": await db.jobs.count_documents({}),
        "release": os.environ.get("RENDER_GIT_COMMIT", "local"),
        "attendance_deliveries": deliveries,
        "recruitment_review_count": await db.workers.count_documents({"created_at": {"$lt": cutoff}, "source": {"$ne": "Talent Bank"}}),
        "review_note": "Review older recruitment profiles for continuing relevance. No automatic deletion is performed.",
        "backup_note": "Business ZIP restore adds missing records only. Verify database snapshots and attachment recovery separately.",
    }

"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "status_checks": [IndexModel([("timestamp", DESCENDING)], name="timestamp_desc")],
    "workers": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
        IndexModel([("job_id", ASCENDING), ("created_at", DESCENDING)], name="job_created"),
        IndexModel([("application_fingerprint", ASCENDING)], name="application_fingerprint", unique=True, sparse=True),
        IndexModel([("submission_hash", ASCENDING)], name="submission_hash", unique=True, sparse=True),
    ],
    "assignments": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("client_id", ASCENDING), ("employee_id_key", ASCENDING)], name="company_employee_id", unique=True, partialFilterExpression={"employee_id_key": {"$type": "string"}}),
        IndexModel([("worker_id", ASCENDING), ("status", ASCENDING)], name="worker_status"),
    ],
    "resume_files": [
        IndexModel([("worker_id", ASCENDING)], name="worker_id", unique=True),
    ],
    "company_requests": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("status", ASCENDING), ("created_at", DESCENDING)], name="status_created"),
    ],
    "jobs": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("active", ASCENDING), ("created_at", DESCENDING)], name="active_created"),
    ],
    "clients": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("visible", ASCENDING), ("sort_order", ASCENDING)], name="visible_order"),
    ],
    "settings": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "invoices": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("invoice_number", ASCENDING)], name="invoice_number", unique=True),
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
        IndexModel([("company_id", ASCENDING), ("created_at", DESCENDING)], name="company_created"),
        IndexModel([("service_month", ASCENDING)], name="service_month"),
    ],
    "invoice_companies": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
    ],
    "expenses": [
        IndexModel([("month", ASCENDING), ("expense_date", DESCENDING), ("created_at", DESCENDING), ("id", ASCENDING)], name="month_date_created"),
    ],
    "payroll": [
        IndexModel([("company_id", ASCENDING), ("month", DESCENDING)], name="company_month"),
        IndexModel([("updated_at", DESCENDING)], name="updated_desc"),
    ],
    "admin_users": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("username", ASCENDING)], name="username", unique=True),
    ],
    "admin_sessions": [
        IndexModel([("token_hash", ASCENDING)], name="token_hash", unique=True),
        IndexModel([("expires_at", ASCENDING)], name="expires_ttl", expireAfterSeconds=0),
    ],
    "admin_login_attempts": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("expires_at", ASCENDING)], name="expires_ttl", expireAfterSeconds=0),
    ],
    "visits": [IndexModel([("created_at", DESCENDING)], name="created_desc")],
    "cron_runs": [
        IndexModel([("run_id", ASCENDING)], name="run_id", unique=True),
        # drop idempotency keys after 30 days so the collection cannot grow forever
        IndexModel([("created_at", ASCENDING)], name="ttl", expireAfterSeconds=2592000),
    ],
    "shortlists": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
    ],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)

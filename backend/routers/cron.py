"""Platform cron endpoints.

Contract: acknowledge 2xx immediately and hand the real work to a BackgroundTask — the
dispatcher waits only ~5s for the status line, never reads the body, and never retries.
"""

import hmac
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request
from pydantic import BaseModel

from lib.db import db
from lib.notify import build_html, email_configured, send_notification

router = APIRouter(prefix="/cron")
logger = logging.getLogger(__name__)


class CronAck(BaseModel):
    ok: bool
    queued: bool
    detail: Optional[str] = None


def _authorize(authorization: Optional[str]) -> None:
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    if not secret:
        logger.error("WEBHOOK_CRON_SECRET is not configured")
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization.removeprefix("Bearer ").strip()
    if not hmac.compare_digest(token, secret):  # constant time
        raise HTTPException(status_code=401, detail="Unauthorized")


async def _already_ran(run_id: str) -> bool:
    """Idempotency: the same run_id must never send two emails."""
    if not run_id:
        return False
    existing = await db.cron_runs.find_one({"run_id": run_id})
    if existing:
        return True
    await db.cron_runs.insert_one(
        {"run_id": run_id, "created_at": datetime.now(timezone.utc)}
    )
    return False


async def _send_digest() -> None:
    """Yesterday's activity summary. Skips sending when there was no activity."""
    now = datetime.now(timezone.utc)
    start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start_yesterday = start_today - timedelta(days=1)
    window = {"$gte": start_yesterday, "$lt": start_today}

    visits = await db.visits.count_documents({"created_at": window})
    workers = await db.workers.find({"created_at": window}, {"_id": 0}).to_list(200)
    requests = await db.company_requests.find({"created_at": window}, {"_id": 0}).to_list(200)

    if visits == 0 and not workers and not requests:
        logger.info("daily digest: no activity for %s — skipping send", start_yesterday.date())
        return

    rows: list[tuple[str, Any]] = [
        ("Date", start_yesterday.strftime("%d %b %Y")),
        ("Website Visits", visits),
        ("New Job Applications", len(workers)),
        ("New Manpower Requests", len(requests)),
    ]
    for w in workers:
        rows.append(
            (
                "Applicant",
                f"{w.get('full_name', '—')} · {w.get('skill_category', '—')} · "
                f"{w.get('current_location', '—')} · {w.get('mobile', '—')}",
            )
        )
    for r in requests:
        rows.append(
            (
                "Manpower Request",
                f"{r.get('company_name', '—')} · {r.get('worker_count', '—')} x "
                f"{r.get('job_role', '—')} · {r.get('mobile', '—')}",
            )
        )

    await send_notification(
        f"Daily Summary — {start_yesterday.strftime('%d %b %Y')}",
        build_html("Daily Activity Summary", rows),
    )


@router.post("/digest", response_model=CronAck)
async def digest(
    request: Request,
    background: BackgroundTasks,
    authorization: Optional[str] = Header(None),
    x_webhook_id: Optional[str] = Header(None),
) -> CronAck:
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    _authorize(authorization)

    try:
        envelope = await request.json()
    except Exception:
        envelope = {}
    if not isinstance(envelope, dict):
        raise HTTPException(status_code=400, detail="Invalid webhook body")

    run_id = x_webhook_id or str(envelope.get("run_id") or "")
    if await _already_ran(run_id):
        return CronAck(ok=True, queued=False, detail="duplicate delivery ignored")

    if not email_configured():
        return CronAck(ok=True, queued=False, detail="email not configured; nothing sent")

    background.add_task(_send_digest)
    return CronAck(ok=True, queued=True)

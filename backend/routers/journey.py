"""Anonymous aggregate journey counts; no visitor identifier or submitted values."""
from datetime import datetime, timedelta, timezone
from typing import Literal
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict
from lib.auth import require_owner
from lib.db import db
from lib.submission_limits import limit_submission

router = APIRouter()
EventName = Literal["candidate_start", "candidate_saved", "employer_start", "employer_saved", "call_click", "whatsapp_click", "job_view"]
class Event(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event: EventName

@router.post("/journey", status_code=204)
async def record_event(payload: Event, request: Request):
    await limit_submission(db, request, "journey", limit=150)
    await db.journey_events.insert_one({"event": payload.event, "created_at": datetime.now(timezone.utc)})

@router.get("/admin/journey", dependencies=[Depends(require_owner)])
async def journey_counts():
    since = datetime.now(timezone.utc) - timedelta(days=30)
    from typing import get_args
    return {"days": 30, "counts": {name: await db.journey_events.count_documents({"event": name, "created_at": {"$gte": since}}) for name in get_args(EventName)}}

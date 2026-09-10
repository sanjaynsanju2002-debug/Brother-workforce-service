"""Shortlists, job-candidate matching and traffic history — all PIN-protected admin tools."""

import csv
import io
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from lib.auth import verify_pin
from lib.db import db
from models.bws import Ok, Worker

router = APIRouter(prefix="/admin")


# ---------- models ----------
class ShortlistCreate(BaseModel):
    name: str
    request_id: Optional[str] = None
    notes: Optional[str] = None


class Shortlist(ShortlistCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    worker_ids: list[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WorkerRef(BaseModel):
    worker_id: str


class DayPoint(BaseModel):
    date: str
    visits: int
    applications: int
    requests: int


# ---------- shortlists ----------
@router.get("/shortlists", response_model=list[Shortlist])
async def list_shortlists(pin: str = Query(...)) -> list[Shortlist]:
    await verify_pin(pin)
    docs = await db.shortlists.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [Shortlist(**d) for d in docs]


@router.post("/shortlists", response_model=Shortlist)
async def create_shortlist(payload: ShortlistCreate, pin: str = Query(...)) -> Shortlist:
    await verify_pin(pin)
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Shortlist name is required")
    sl = Shortlist(**payload.model_dump())
    await db.shortlists.insert_one(sl.model_dump())
    return sl


@router.post("/shortlists/{sl_id}/workers", response_model=Shortlist)
async def add_worker(sl_id: str, payload: WorkerRef, pin: str = Query(...)) -> Shortlist:
    await verify_pin(pin)
    if not await db.workers.find_one({"id": payload.worker_id}):
        raise HTTPException(status_code=404, detail="Candidate not found")
    doc = await db.shortlists.find_one_and_update(
        {"id": sl_id},
        {"$addToSet": {"worker_ids": payload.worker_id}},  # idempotent, no duplicates
        return_document=True,
        projection={"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Shortlist not found")
    return Shortlist(**doc)


@router.delete("/shortlists/{sl_id}/workers/{worker_id}", response_model=Shortlist)
async def remove_worker(sl_id: str, worker_id: str, pin: str = Query(...)) -> Shortlist:
    await verify_pin(pin)
    doc = await db.shortlists.find_one_and_update(
        {"id": sl_id},
        {"$pull": {"worker_ids": worker_id}},
        return_document=True,
        projection={"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Shortlist not found")
    return Shortlist(**doc)


@router.get("/shortlists/{sl_id}/workers", response_model=list[Worker])
async def shortlist_workers(sl_id: str, pin: str = Query(...)) -> list[Worker]:
    await verify_pin(pin)
    sl = await db.shortlists.find_one({"id": sl_id}, {"_id": 0})
    if not sl:
        raise HTTPException(status_code=404, detail="Shortlist not found")
    docs = await db.workers.find({"id": {"$in": sl.get("worker_ids", [])}}, {"_id": 0}).to_list(500)
    return [Worker(**d) for d in docs]


@router.delete("/shortlists/{sl_id}", response_model=Ok)
async def delete_shortlist(sl_id: str, pin: str = Query(...)) -> Ok:
    await verify_pin(pin)
    res = await db.shortlists.delete_one({"id": sl_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Shortlist not found")
    return Ok(ok=True)


SHORTLIST_COLUMNS = [
    ("full_name", "Full Name"),
    ("mobile", "Mobile"),
    ("whatsapp", "WhatsApp"),
    ("skill_category", "Skill Category"),
    ("skills", "Skills"),
    ("experience", "Experience"),
    ("current_location", "Current Location"),
    ("availability", "Availability"),
    ("expected_salary", "Expected Salary"),
    ("status", "Status"),
]


@router.get("/shortlists/{sl_id}/export.csv")
async def export_shortlist(sl_id: str, pin: str = Query(...)) -> StreamingResponse:
    await verify_pin(pin)
    sl = await db.shortlists.find_one({"id": sl_id}, {"_id": 0})
    if not sl:
        raise HTTPException(status_code=404, detail="Shortlist not found")
    rows = await db.workers.find({"id": {"$in": sl.get("worker_ids", [])}}, {"_id": 0}).to_list(500)

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([label for _, label in SHORTLIST_COLUMNS])
    for row in rows:
        w.writerow(["" if row.get(k) is None else str(row.get(k)) for k, _ in SHORTLIST_COLUMNS])
    buf.seek(0)

    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", sl.get("name", "shortlist")).strip("-") or "shortlist"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{safe}.csv"'},
    )


# ---------- job matching (alerts) ----------
@router.get("/jobs/{job_id}/matches", response_model=list[Worker])
async def job_matches(job_id: str, pin: str = Query(...)) -> list[Worker]:
    """Candidates whose skill category matches the job, ranked location-first."""
    await verify_pin(pin)
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    query: dict = {}
    if job.get("skill_category"):
        query["skill_category"] = job["skill_category"]
    docs = await db.workers.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)

    loc = (job.get("location") or "").lower()
    first_token = loc.split(",")[0].strip()

    def local(w: dict) -> bool:
        blob = f"{w.get('current_location', '')} {w.get('preferred_location', '')}".lower()
        return bool(first_token) and first_token in blob

    docs.sort(key=lambda w: (not local(w), w.get("full_name", "")))
    return [Worker(**d) for d in docs]


# ---------- traffic history ----------
@router.get("/traffic/daily", response_model=list[DayPoint])
async def traffic_daily(pin: str = Query(...), days: int = Query(30, ge=1, le=90)) -> list[DayPoint]:
    """One point per day for the last `days` days, zero-filled. Anchored server-side (UTC)."""
    await verify_pin(pin)
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(
        days=days - 1
    )

    async def bucket(collection: str) -> dict[str, int]:
        pipeline = [
            {"$match": {"created_at": {"$gte": start}}},
            {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}}, "n": {"$sum": 1}}},
        ]
        return {d["_id"]: d["n"] async for d in db[collection].aggregate(pipeline)}

    visits = await bucket("visits")
    workers = await bucket("workers")
    requests = await bucket("company_requests")

    out: list[DayPoint] = []
    for i in range(days):
        day = (start + timedelta(days=i)).strftime("%Y-%m-%d")
        out.append(
            DayPoint(
                date=day,
                visits=visits.get(day, 0),
                applications=workers.get(day, 0),
                requests=requests.get(day, 0),
            )
        )
    return out

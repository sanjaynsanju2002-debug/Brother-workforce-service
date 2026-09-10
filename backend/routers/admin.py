"""PIN-protected admin API. PIN comes from ADMIN_PIN in backend/.env."""

import csv
import io
import os
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from lib.auth import current_pin, env_pin, set_pin, verify_pin
from lib.db import db
from lib.notify import email_configured
from models.bws import (
    ActiveUpdate,
    AdminStats,
    CompanyRequest,
    Job,
    JobCreate,
    Ok,
    PinChange,
    SecurityInfo,
    StatusUpdate,
    Worker,
    WorkerFilters,
)
from models.visits import TrafficStats

router = APIRouter(prefix="/admin")



@router.post("/login", response_model=Ok)
async def login(pin: str = Query(...)) -> Ok:
    await verify_pin(pin)
    return Ok(ok=True)


@router.get("/stats", response_model=AdminStats)
async def stats(pin: str = Query(...)) -> AdminStats:
    await verify_pin(pin)
    return AdminStats(
        workers=await db.workers.count_documents({}),
        requests=await db.company_requests.count_documents({}),
        open_requests=await db.company_requests.count_documents({"status": "Pending"}),
        active_jobs=await db.jobs.count_documents({"active": True}),
        email_configured=email_configured(),
    )


@router.get("/traffic", response_model=TrafficStats)
async def traffic(pin: str = Query(...)) -> TrafficStats:
    """Visitor + conversion counts. 'Today' is anchored server-side (pod clock is UTC)."""
    await verify_pin(pin)
    now = datetime.now(timezone.utc)
    start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start_week = start_today - timedelta(days=6)
    return TrafficStats(
        visits_total=await db.visits.count_documents({}),
        visits_today=await db.visits.count_documents({"created_at": {"$gte": start_today}}),
        visits_week=await db.visits.count_documents({"created_at": {"$gte": start_week}}),
        workers_total=await db.workers.count_documents({}),
        workers_today=await db.workers.count_documents({"created_at": {"$gte": start_today}}),
        requests_total=await db.company_requests.count_documents({}),
        requests_today=await db.company_requests.count_documents({"created_at": {"$gte": start_today}}),
    )


@router.get("/security", response_model=SecurityInfo)
async def security_info(pin: str = Query(...)) -> SecurityInfo:
    """Returns the active PIN — only reachable by someone who already knows it."""
    await verify_pin(pin)
    return SecurityInfo(pin=await current_pin(), is_default=await current_pin() == env_pin())


@router.post("/security/pin", response_model=SecurityInfo)
async def change_pin(payload: PinChange, pin: str = Query(...)) -> SecurityInfo:
    await verify_pin(pin)
    new_pin = payload.new_pin.strip()
    if not new_pin.isdigit() or not (4 <= len(new_pin) <= 12):
        raise HTTPException(status_code=400, detail="PIN must be 4 to 12 digits")
    await set_pin(new_pin)
    return SecurityInfo(pin=new_pin, is_default=new_pin == env_pin())


@router.get("/workers", response_model=list[Worker])
async def list_workers(
    pin: str = Query(...),
    skill_category: str | None = Query(None),
    location: str | None = Query(None),
    availability: str | None = Query(None),
    status: str | None = Query(None),
    q: str | None = Query(None),
) -> list[Worker]:
    await verify_pin(pin)
    query: dict = {}
    if skill_category:
        query["skill_category"] = skill_category
    if availability:
        query["availability"] = availability
    if status:
        query["status"] = status
    if location:
        query["$or"] = [
            {"current_location": {"$regex": re.escape(location), "$options": "i"}},
            {"preferred_location": {"$regex": re.escape(location), "$options": "i"}},
        ]
    if q:
        term = {"$regex": re.escape(q), "$options": "i"}
        clause = [
            {"full_name": term},
            {"mobile": term},
            {"skills": term},
            {"education": term},
            {"previous_experience": term},
        ]
        # keep an existing $or (location) intact by combining with $and
        if "$or" in query:
            query = {"$and": [{"$or": query.pop("$or")}, {"$or": clause}], **query}
        else:
            query["$or"] = clause
    docs = await db.workers.find(query).sort("created_at", -1).to_list(500)
    return [Worker(**d) for d in docs]


@router.get("/worker-filters", response_model=WorkerFilters)
async def worker_filters(pin: str = Query(...)) -> WorkerFilters:
    """Distinct values so the admin filters only offer options that exist."""
    await verify_pin(pin)
    return WorkerFilters(
        skill_categories=sorted(x for x in await db.workers.distinct("skill_category") if x),
        locations=sorted(x for x in await db.workers.distinct("current_location") if x),
        availabilities=sorted(x for x in await db.workers.distinct("availability") if x),
    )


@router.patch("/workers/{worker_id}", response_model=Worker)
async def update_worker(worker_id: str, payload: StatusUpdate, pin: str = Query(...)) -> Worker:
    await verify_pin(pin)
    doc = await db.workers.find_one_and_update(
        {"id": worker_id}, {"$set": {"status": payload.status}}, return_document=True
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    doc.pop("_id", None)
    return Worker(**doc)


@router.get("/company-requests", response_model=list[CompanyRequest])
async def list_requests(pin: str = Query(...)) -> list[CompanyRequest]:
    await verify_pin(pin)
    docs = await db.company_requests.find().sort("created_at", -1).to_list(500)
    return [CompanyRequest(**d) for d in docs]


@router.patch("/company-requests/{req_id}", response_model=CompanyRequest)
async def update_request(req_id: str, payload: StatusUpdate, pin: str = Query(...)) -> CompanyRequest:
    await verify_pin(pin)
    doc = await db.company_requests.find_one_and_update(
        {"id": req_id}, {"$set": {"status": payload.status}}, return_document=True
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    doc.pop("_id", None)
    return CompanyRequest(**doc)


@router.get("/jobs", response_model=list[Job])
async def admin_jobs(pin: str = Query(...)) -> list[Job]:
    await verify_pin(pin)
    docs = await db.jobs.find().sort("created_at", -1).to_list(500)
    return [Job(**d) for d in docs]


@router.post("/jobs", response_model=Job)
async def create_job(payload: JobCreate, pin: str = Query(...)) -> Job:
    await verify_pin(pin)
    job = Job(**payload.model_dump())
    await db.jobs.insert_one(job.model_dump())
    return job


@router.patch("/jobs/{job_id}", response_model=Job)
async def toggle_job(job_id: str, payload: ActiveUpdate, pin: str = Query(...)) -> Job:
    await verify_pin(pin)
    doc = await db.jobs.find_one_and_update(
        {"id": job_id}, {"$set": {"active": payload.active}}, return_document=True
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    doc.pop("_id", None)
    return Job(**doc)


@router.delete("/jobs/{job_id}", response_model=Ok)
async def delete_job(job_id: str, pin: str = Query(...)) -> Ok:
    await verify_pin(pin)
    res = await db.jobs.delete_one({"id": job_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return Ok(ok=True)


WORKER_COLUMNS = [
    ("created_at", "Application Date"),
    ("full_name", "Full Name"),
    ("mobile", "Mobile"),
    ("whatsapp", "WhatsApp"),
    ("age", "Age"),
    ("gender", "Gender"),
    ("current_location", "Current Location"),
    ("education", "Education"),
    ("experience", "Experience"),
    ("skill_category", "Skill Category"),
    ("skills", "Skills"),
    ("previous_experience", "Previous Experience"),
    ("preferred_location", "Preferred Location"),
    ("expected_salary", "Expected Salary"),
    ("availability", "Availability"),
    ("resume_filename", "Resume"),
    ("status", "Status"),
]

REQUEST_COLUMNS = [
    ("created_at", "Enquiry Date"),
    ("company_name", "Company Name"),
    ("contact_person", "Contact Person"),
    ("designation", "Designation"),
    ("mobile", "Mobile"),
    ("email", "Email"),
    ("company_location", "Company Location"),
    ("industry", "Industry"),
    ("workforce_type", "Workforce Type"),
    ("job_role", "Job Role"),
    ("worker_count", "Workers Required"),
    ("shift_details", "Shift Details"),
    ("joining_date", "Expected Joining Date"),
    ("work_location", "Work Location"),
    ("description", "Requirement Description"),
    ("status", "Status"),
]


def _csv_response(rows: list[dict], columns: list[tuple[str, str]], filename: str) -> StreamingResponse:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([label for _, label in columns])
    for row in rows:
        out = []
        for key, _ in columns:
            value = row.get(key)
            if hasattr(value, "strftime"):
                value = value.strftime("%Y-%m-%d %H:%M")
            out.append("" if value is None else str(value))
        writer.writerow(out)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/workers.csv")
async def export_workers(pin: str = Query(...)) -> StreamingResponse:
    await verify_pin(pin)
    rows = await db.workers.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    return _csv_response(rows, WORKER_COLUMNS, "worker-applications.csv")


@router.get("/export/company-requests.csv")
async def export_requests(pin: str = Query(...)) -> StreamingResponse:
    await verify_pin(pin)
    rows = await db.company_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    return _csv_response(rows, REQUEST_COLUMNS, "company-enquiries.csv")

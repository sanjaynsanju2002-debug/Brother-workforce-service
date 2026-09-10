"""Public API: worker registrations, company manpower requests, job listings."""

import re
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from lib.db import db
from lib.notify import build_html, send_notification
from models.bws import (
    CompanyRequest,
    CompanyRequestCreate,
    Job,
    Ok,
    Worker,
    WorkerCreate,
)
from models.visits import Visit, VisitCreate

router = APIRouter()

UPLOAD_DIR = Path(__file__).parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_EXT = {".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg"}


@router.post("/workers", response_model=Worker)
async def create_worker(payload: WorkerCreate, background: BackgroundTasks) -> Worker:
    worker = Worker(**payload.model_dump())
    await db.workers.insert_one(worker.model_dump())
    background.add_task(
        send_notification,
        "New Worker Registration",
        build_html(
            "New Worker Registration",
            [
                ("Full Name", worker.full_name),
                ("Mobile", worker.mobile),
                ("WhatsApp", worker.whatsapp),
                ("Age", worker.age),
                ("Gender", worker.gender),
                ("Current Location", worker.current_location),
                ("Education", worker.education),
                ("Experience", worker.experience),
                ("Skill Category", worker.skill_category),
                ("Skills", worker.skills),
                ("Previous Experience", worker.previous_experience),
                ("Preferred Location", worker.preferred_location),
                ("Expected Salary", worker.expected_salary),
                ("Availability", worker.availability),
            ],
        ),
    )
    return worker


@router.post("/workers/{worker_id}/resume", response_model=Worker)
async def upload_resume(worker_id: str, file: UploadFile = File(...)) -> Worker:
    doc = await db.workers.find_one({"id": worker_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Worker application not found")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext or 'unknown'}")

    safe = re.sub(r"[^A-Za-z0-9._-]", "_", Path(file.filename or "resume").name)
    stored = UPLOAD_DIR / f"{worker_id}__{safe}"
    stored.write_bytes(await file.read())

    await db.workers.update_one({"id": worker_id}, {"$set": {"resume_filename": safe}})
    doc["resume_filename"] = safe
    doc.pop("_id", None)
    return Worker(**doc)


@router.get("/workers/{worker_id}/resume")
async def download_resume(worker_id: str) -> FileResponse:
    doc = await db.workers.find_one({"id": worker_id})
    if not doc or not doc.get("resume_filename"):
        raise HTTPException(status_code=404, detail="No resume on file")
    stored = UPLOAD_DIR / f"{worker_id}__{doc['resume_filename']}"
    if not stored.exists():
        raise HTTPException(status_code=404, detail="No resume on file")
    return FileResponse(stored, filename=doc["resume_filename"])


@router.post("/company-requests", response_model=CompanyRequest)
async def create_company_request(
    payload: CompanyRequestCreate, background: BackgroundTasks
) -> CompanyRequest:
    req = CompanyRequest(**payload.model_dump())
    await db.company_requests.insert_one(req.model_dump())
    background.add_task(
        send_notification,
        "New Manpower Requirement",
        build_html(
            "New Manpower Requirement",
            [
                ("Company Name", req.company_name),
                ("Contact Person", req.contact_person),
                ("Designation", req.designation),
                ("Mobile", req.mobile),
                ("Email", req.email),
                ("Company Location", req.company_location),
                ("Industry", req.industry),
                ("Workforce Type", req.workforce_type),
                ("Job Role", req.job_role),
                ("Workers Required", req.worker_count),
                ("Shift Details", req.shift_details),
                ("Expected Joining Date", req.joining_date),
                ("Work Location", req.work_location),
                ("Requirement", req.description),
            ],
        ),
    )
    return req


@router.get("/jobs", response_model=list[Job])
async def list_jobs() -> list[Job]:
    docs = await db.jobs.find({"active": True}).sort("created_at", -1).to_list(200)
    return [Job(**d) for d in docs]


@router.post("/visits", response_model=Ok)
async def record_visit(payload: VisitCreate) -> Ok:
    """Anonymous visit counter — no IP, cookie or personal data is stored."""
    visit = Visit(path=payload.path)
    await db.visits.insert_one(visit.model_dump())
    return Ok(ok=True)

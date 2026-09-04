"""Public API: worker registrations, company manpower requests, job listings."""

import re
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from lib.db import db
from models.bws import (
    CompanyRequest,
    CompanyRequestCreate,
    Job,
    Worker,
    WorkerCreate,
)

router = APIRouter()

UPLOAD_DIR = Path(__file__).parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_EXT = {".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg"}


@router.post("/workers", response_model=Worker)
async def create_worker(payload: WorkerCreate) -> Worker:
    worker = Worker(**payload.model_dump())
    await db.workers.insert_one(worker.model_dump())
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
async def create_company_request(payload: CompanyRequestCreate) -> CompanyRequest:
    req = CompanyRequest(**payload.model_dump())
    await db.company_requests.insert_one(req.model_dump())
    return req


@router.get("/jobs", response_model=list[Job])
async def list_jobs() -> list[Job]:
    docs = await db.jobs.find({"active": True}).sort("created_at", -1).to_list(200)
    return [Job(**d) for d in docs]

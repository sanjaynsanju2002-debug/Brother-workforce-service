"""Public API: worker registrations, company manpower requests, job listings."""

import io
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import boto3
from bson.binary import Binary

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

from lib.auth import verify_pin
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
MAX_RESUME_SIZE = 5 * 1024 * 1024  # 5 MB
R2_BUCKET = os.getenv("R2_BUCKET", "")
R2_ENDPOINT = os.getenv("R2_ENDPOINT", "")
logger = logging.getLogger(__name__)


def _r2():
    if not R2_BUCKET or not R2_ENDPOINT:
        raise HTTPException(status_code=503, detail="Resume storage is not configured")
    return boto3.client("s3", endpoint_url=R2_ENDPOINT, region_name=os.getenv("AWS_DEFAULT_REGION", "auto"))


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

    contents = await file.read(MAX_RESUME_SIZE + 1)
    if len(contents) > MAX_RESUME_SIZE:
        raise HTTPException(status_code=413, detail="Resume must be 5 MB or smaller")

    safe = re.sub(r"[^A-Za-z0-9._-]", "_", Path(file.filename or "resume").name)
    object_key = f"resumes/{worker_id}/{safe}"

    content_type = file.content_type or "application/octet-stream"
    stored_in_r2 = False

    # Prefer R2 when it is healthy, but never block a job application because
    # object storage is temporarily unavailable. MongoDB is the persistent fallback.
    if R2_BUCKET and R2_ENDPOINT:
        try:
            _r2().put_object(
                Bucket=R2_BUCKET,
                Key=object_key,
                Body=contents,
                ContentType=content_type,
            )
            stored_in_r2 = True
        except Exception as exc:
            logger.warning("R2 resume upload failed for %s; using MongoDB fallback: %s", worker_id, exc)

    if stored_in_r2:
        await db.resume_files.delete_one({"worker_id": worker_id})
        await db.workers.update_one(
            {"id": worker_id},
            {
                "$set": {
                    "resume_filename": safe,
                    "resume_object_key": object_key,
                    "resume_storage": "r2",
                }
            },
        )
        doc["resume_filename"] = safe
        doc["resume_object_key"] = object_key
        doc["resume_storage"] = "r2"
    else:
        try:
            await db.resume_files.update_one(
                {"worker_id": worker_id},
                {
                    "$set": {
                        "worker_id": worker_id,
                        "filename": safe,
                        "content_type": content_type,
                        "data": Binary(contents),
                        "updated_at": datetime.now(timezone.utc),
                    }
                },
                upsert=True,
            )
        except Exception as exc:
            logger.exception("MongoDB resume fallback failed for %s", worker_id)
            raise HTTPException(status_code=503, detail="Could not store resume. Please try again.") from exc

        await db.workers.update_one(
            {"id": worker_id},
            {
                "$set": {"resume_filename": safe, "resume_storage": "mongo"},
                "$unset": {"resume_object_key": ""},
            },
        )
        doc["resume_filename"] = safe
        doc["resume_storage"] = "mongo"
        doc.pop("resume_object_key", None)

    doc.pop("_id", None)
    return Worker(**doc)


@router.get("/workers/{worker_id}/resume")
async def download_resume(worker_id: str, pin: str = Query(...)):
    await verify_pin(pin)
    doc = await db.workers.find_one({"id": worker_id})
    if not doc or not doc.get("resume_filename"):
        raise HTTPException(status_code=404, detail="No resume on file")

    object_key = doc.get("resume_object_key")
    if object_key and R2_BUCKET and R2_ENDPOINT:
        try:
            obj = _r2().get_object(Bucket=R2_BUCKET, Key=object_key)
            return StreamingResponse(
                obj["Body"].iter_chunks(),
                media_type=obj.get("ContentType") or "application/octet-stream",
                headers={"Content-Disposition": f'attachment; filename="{doc["resume_filename"]}"'},
            )
        except Exception as exc:
            logger.warning("R2 resume download failed for %s; trying fallback storage: %s", worker_id, exc)

    mongo_resume = await db.resume_files.find_one({"worker_id": worker_id}, {"_id": 0})
    if mongo_resume and mongo_resume.get("data") is not None:
        return StreamingResponse(
            io.BytesIO(bytes(mongo_resume["data"])),
            media_type=mongo_resume.get("content_type") or "application/octet-stream",
            headers={
                "Content-Disposition": f'attachment; filename="{mongo_resume.get("filename") or doc["resume_filename"]}"'
            },
        )

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

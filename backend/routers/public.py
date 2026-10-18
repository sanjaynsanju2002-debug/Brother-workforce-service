"""Public API: worker registrations, company manpower requests, job listings."""

import io
import json
import hashlib
import hmac
import logging
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

import boto3
from bson.binary import Binary

from fastapi import APIRouter, Depends, BackgroundTasks, File, HTTPException, UploadFile, Request
from uuid import UUID
from pymongo.errors import DuplicateKeyError
from fastapi.responses import FileResponse, StreamingResponse

from lib.auth import require_admin
from lib.applications import worker_input, company_input
from lib.db import db
from lib.jobs import open_jobs_query
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
MAX_RESUME_SIZE = 2 * 1024 * 1024  # 2 MB
R2_BUCKET = os.getenv("R2_BUCKET", "")
R2_ENDPOINT = os.getenv("R2_ENDPOINT", "")
logger = logging.getLogger(__name__)


def _r2():
    if not R2_BUCKET or not R2_ENDPOINT:
        raise HTTPException(status_code=503, detail="Resume storage is not configured")
    return boto3.client("s3", endpoint_url=R2_ENDPOINT, region_name=os.getenv("AWS_DEFAULT_REGION", "auto"))


class WorkerSubmission(WorkerCreate):
    request_id: UUID | None = None


class WorkerReceipt(Worker):
    upload_token: str
    application_reference: str


def receipt(doc: dict, token: str) -> WorkerReceipt:
    return WorkerReceipt(**Worker(**doc).model_dump(), upload_token=token,
                         application_reference='BWS-' + doc['id'].replace('-', '')[:12].upper())


@router.post("/workers", response_model=WorkerReceipt)
async def create_worker(payload: WorkerSubmission, background: BackgroundTasks) -> WorkerReceipt:
    if not payload.consent_to_share:
        raise HTTPException(status_code=400, detail="Please agree to recruitment use of your profile")
    job_title = None
    if payload.job_id:
        job = await db.jobs.find_one({"id": payload.job_id, **open_jobs_query()}, {"_id": 0, "title": 1})
        if not job:
            raise HTTPException(status_code=404, detail="This job is no longer open. You can still register your profile.")
        job_title = job["title"]
    data = worker_input(payload.model_dump(exclude={'request_id'}))
    token = str(payload.request_id) if payload.request_id else secrets.token_urlsafe(32)
    submission_hash = hashlib.sha256(token.encode()).hexdigest()
    existing = await db.workers.find_one({'submission_hash': submission_hash})
    if existing:
        if any(existing.get(k) != v for k, v in data.items()):
            raise HTTPException(409, 'This submission was already saved with different details. Contact our team to update it.')
        return receipt(existing, token)
    fingerprint = hashlib.sha256(f"{data['mobile']}|{data['full_name'].casefold()}|{data.get('job_id') or ''}".encode()).hexdigest()
    duplicate = await db.workers.find_one({'$or': [
        {'application_fingerprint': fingerprint},
        {'mobile': data['mobile'], 'full_name': data['full_name'], 'job_id': data.get('job_id')},
    ]})
    if duplicate:
        raise HTTPException(409, 'An application with these details is already saved for this opening. Contact our team to update it.')
    worker = Worker(**data, job_title=job_title)
    record = {**worker.model_dump(), 'submission_hash': submission_hash,
              'application_fingerprint': fingerprint, 'upload_token_hash': submission_hash,
              'upload_expires_at': datetime.now(timezone.utc) + timedelta(hours=1)}
    try:
        await db.workers.insert_one(record)
    except DuplicateKeyError:
        existing = await db.workers.find_one({'submission_hash': submission_hash})
        if existing and all(existing.get(k) == v for k, v in data.items()):
            return receipt(existing, token)
        raise HTTPException(409, 'An application with these details is already saved. Contact our team to update it.')
    background.add_task(
        send_notification,
        "New Worker Registration",
        build_html(
            "New Worker Registration",
            [
                ("Full Name", worker.full_name),
                ("Applied For", worker.job_title or "General registration"),
                ("Recruitment Consent", "Yes"),
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
    return receipt(record, token)


@router.post("/workers/{worker_id}/resume", response_model=Worker)
async def upload_resume(worker_id: str, request: Request, file: UploadFile = File(...)) -> Worker:
    doc = await db.workers.find_one({"id": worker_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Worker application not found")

    supplied = request.headers.get('x-upload-token', '')
    expires = doc.get('upload_expires_at')
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    valid_upload = supplied and expires and expires > datetime.now(timezone.utc) and hmac.compare_digest(
        hashlib.sha256(supplied.encode()).hexdigest(), doc.get('upload_token_hash', '')
    )
    if not valid_upload:
        if request.cookies.get('bws_admin_session'):
            await require_admin(request)
        else:
            raise HTTPException(403, 'Upload authorization expired. Contact our recruitment team to add or replace your resume.')

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext or 'unknown'}")

    contents = await file.read(MAX_RESUME_SIZE + 1)
    if not contents:
        raise HTTPException(422, 'Choose a non-empty resume file')
    if len(contents) > MAX_RESUME_SIZE:
        raise HTTPException(status_code=413, detail="Resume must be 2 MB or smaller")

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


@router.get("/workers/{worker_id}/resume", dependencies=[Depends(require_admin)])
async def download_resume(worker_id: str):
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


class CompanySubmission(CompanyRequestCreate):
    request_id: UUID | None = None


@router.post("/company-requests", response_model=CompanyRequest)
async def create_company_request(
    payload: CompanySubmission, background: BackgroundTasks
) -> CompanyRequest:
    data = company_input(payload.model_dump(exclude={"request_id"}))
    fingerprint = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
    request_id = str(payload.request_id) if payload.request_id else None
    if request_id:
        existing = await db.company_requests.find_one({"id": request_id})
        if existing:
            if existing.get("submission_hash") != fingerprint:
                raise HTTPException(409, "This request was already saved. Use Submit another request for a new requirement.")
            return CompanyRequest(**existing)
    req = CompanyRequest(**data, **({"id": request_id} if request_id else {}))
    req.reference = "BWS-ENQ-" + req.id.replace("-", "").upper()[:12]
    try:
        await db.company_requests.insert_one({"_id": req.id, **req.model_dump(), "submission_hash": fingerprint})
    except DuplicateKeyError:
        existing = await db.company_requests.find_one({"id": req.id})
        if not existing or existing.get("submission_hash") != fingerprint:
            raise HTTPException(409, "This request could not be saved. Please try again.")
        return CompanyRequest(**existing)
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
    docs = await db.jobs.find(open_jobs_query()).sort("created_at", -1).to_list(200)
    return [Job(**d) for d in docs]


@router.get("/jobs/{job_id}", response_model=Job)
async def get_job(job_id: str) -> Job:
    doc = await db.jobs.find_one({"id": job_id, **open_jobs_query()}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="This job is no longer open")
    return Job(**doc)


@router.post("/visits", response_model=Ok)
async def record_visit(payload: VisitCreate) -> Ok:
    """Anonymous visit counter — no IP, cookie or personal data is stored."""
    visit = Visit(path=payload.path)
    await db.visits.insert_one(visit.model_dump())
    return Ok(ok=True)


@router.get("/company-brochure.pdf")
async def download_company_brochure():
    from lib.brochure import company_brochure
    from fastapi.responses import Response
    from starlette.concurrency import run_in_threadpool
    return Response(await run_in_threadpool(company_brochure), media_type="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="Brothers-Workforce-Solutions.pdf"', "Cache-Control": "public, max-age=3600"})

"""PIN-protected admin API. PIN comes from ADMIN_PIN in backend/.env."""

import os

from fastapi import APIRouter, HTTPException, Query

from lib.db import db
from models.bws import (
    ActiveUpdate,
    AdminStats,
    CompanyRequest,
    Job,
    JobCreate,
    Ok,
    StatusUpdate,
    Worker,
)

router = APIRouter(prefix="/admin")


def _check(pin: str) -> None:
    if pin != os.environ.get("ADMIN_PIN", "246810"):
        raise HTTPException(status_code=401, detail="Invalid PIN")


@router.post("/login", response_model=Ok)
async def login(pin: str = Query(...)) -> Ok:
    _check(pin)
    return Ok(ok=True)


@router.get("/stats", response_model=AdminStats)
async def stats(pin: str = Query(...)) -> AdminStats:
    _check(pin)
    return AdminStats(
        workers=await db.workers.count_documents({}),
        requests=await db.company_requests.count_documents({}),
        open_requests=await db.company_requests.count_documents({"status": "Pending"}),
        active_jobs=await db.jobs.count_documents({"active": True}),
    )


@router.get("/workers", response_model=list[Worker])
async def list_workers(pin: str = Query(...)) -> list[Worker]:
    _check(pin)
    docs = await db.workers.find().sort("created_at", -1).to_list(500)
    return [Worker(**d) for d in docs]


@router.patch("/workers/{worker_id}", response_model=Worker)
async def update_worker(worker_id: str, payload: StatusUpdate, pin: str = Query(...)) -> Worker:
    _check(pin)
    doc = await db.workers.find_one_and_update(
        {"id": worker_id}, {"$set": {"status": payload.status}}, return_document=True
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    doc.pop("_id", None)
    return Worker(**doc)


@router.get("/company-requests", response_model=list[CompanyRequest])
async def list_requests(pin: str = Query(...)) -> list[CompanyRequest]:
    _check(pin)
    docs = await db.company_requests.find().sort("created_at", -1).to_list(500)
    return [CompanyRequest(**d) for d in docs]


@router.patch("/company-requests/{req_id}", response_model=CompanyRequest)
async def update_request(req_id: str, payload: StatusUpdate, pin: str = Query(...)) -> CompanyRequest:
    _check(pin)
    doc = await db.company_requests.find_one_and_update(
        {"id": req_id}, {"$set": {"status": payload.status}}, return_document=True
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    doc.pop("_id", None)
    return CompanyRequest(**doc)


@router.get("/jobs", response_model=list[Job])
async def admin_jobs(pin: str = Query(...)) -> list[Job]:
    _check(pin)
    docs = await db.jobs.find().sort("created_at", -1).to_list(500)
    return [Job(**d) for d in docs]


@router.post("/jobs", response_model=Job)
async def create_job(payload: JobCreate, pin: str = Query(...)) -> Job:
    _check(pin)
    job = Job(**payload.model_dump())
    await db.jobs.insert_one(job.model_dump())
    return job


@router.patch("/jobs/{job_id}", response_model=Job)
async def toggle_job(job_id: str, payload: ActiveUpdate, pin: str = Query(...)) -> Job:
    _check(pin)
    doc = await db.jobs.find_one_and_update(
        {"id": job_id}, {"$set": {"active": payload.active}}, return_document=True
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    doc.pop("_id", None)
    return Job(**doc)


@router.delete("/jobs/{job_id}", response_model=Ok)
async def delete_job(job_id: str, pin: str = Query(...)) -> Ok:
    _check(pin)
    res = await db.jobs.delete_one({"id": job_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return Ok(ok=True)

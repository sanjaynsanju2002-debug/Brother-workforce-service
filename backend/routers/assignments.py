"""Private company workforce roster, independent of public client cards."""

from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from lib.auth import verify_pin
from lib.db import db

router = APIRouter(prefix="/admin")


class AssignmentCreate(BaseModel):
    client_id: str
    worker_id: str | None = None
    full_name: str = Field(min_length=1, max_length=150)
    mobile: str | None = None
    role: str | None = None
    start_date: str | None = None
    notes: str | None = None


class AssignmentUpdate(BaseModel):
    status: Literal["Active", "Completed"]


class Assignment(AssignmentCreate):
    id: str
    company_name: str
    status: Literal["Active", "Completed"] = "Active"
    created_at: datetime


@router.get("/assignments", response_model=list[Assignment])
async def list_assignments(pin: str = Query(...)) -> list[Assignment]:
    await verify_pin(pin)
    docs = await db.assignments.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return [Assignment(**doc) for doc in docs]


@router.post("/assignments", response_model=Assignment)
async def create_assignment(payload: AssignmentCreate, pin: str = Query(...)) -> Assignment:
    await verify_pin(pin)
    client = await db.clients.find_one({"id": payload.client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Company not found. Add it in Clients first.")

    data = payload.model_dump()
    data["full_name"] = data["full_name"].strip()
    if not data["full_name"]:
        raise HTTPException(status_code=400, detail="Worker name is required")
    if payload.worker_id:
        worker = await db.workers.find_one({"id": payload.worker_id})
        if not worker:
            raise HTTPException(status_code=404, detail="Worker application not found")
        existing = await db.assignments.find_one({
            "client_id": payload.client_id,
            "worker_id": payload.worker_id,
            "status": "Active",
        })
        if existing:
            raise HTTPException(status_code=409, detail="This worker is already active at that company")
        data["full_name"] = worker["full_name"]
        data["mobile"] = worker.get("mobile")

    assignment = Assignment(
        **data,
        id=str(uuid4()),
        company_name=client["name"],
        created_at=datetime.now(timezone.utc),
    )
    await db.assignments.insert_one(assignment.model_dump())
    return assignment


@router.patch("/assignments/{assignment_id}", response_model=Assignment)
async def update_assignment(assignment_id: str, payload: AssignmentUpdate, pin: str = Query(...)) -> Assignment:
    await verify_pin(pin)
    doc = await db.assignments.find_one_and_update(
        {"id": assignment_id}, {"$set": {"status": payload.status}}, return_document=True,
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Assignment not found")
    doc.pop("_id", None)
    return Assignment(**doc)


@router.delete("/assignments/{assignment_id}")
async def delete_assignment(assignment_id: str, pin: str = Query(...)) -> dict[str, bool]:
    await verify_pin(pin)
    result = await db.assignments.delete_one({"id": assignment_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return {"ok": True}

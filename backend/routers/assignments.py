"""Private company workforce roster, independent of public client cards."""

from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from lib.auth import require_admin
from lib.db import db
from lib.invoices import Money

router = APIRouter(prefix="/admin", dependencies=[Depends(require_admin)])


class EmployeeIdInput(BaseModel):
    employee_id: str | None = Field(default=None, max_length=80)

    @field_validator("employee_id")
    @classmethod
    def clean_employee_id(cls, value: str | None) -> str | None:
        return (value.strip() or None) if value is not None else None


class AssignmentCreate(EmployeeIdInput):
    client_id: str
    worker_id: str | None = None
    full_name: str = Field(min_length=1, max_length=150)
    mobile: str | None = None
    role: str | None = None
    start_date: str | None = None
    notes: str | None = None
    salary: Money | None = None
    salary_basis: Literal["Monthly", "Daily"] = "Monthly"


class AssignmentUpdate(EmployeeIdInput):
    status: Literal["Active", "Completed"] | None = None
    salary: Money | None = None
    salary_basis: Literal["Monthly", "Daily"] | None = None


class Assignment(AssignmentCreate):
    id: str
    company_name: str
    status: Literal["Active", "Completed"] = "Active"
    created_at: datetime


@router.get("/assignments", response_model=list[Assignment])
async def list_assignments() -> list[Assignment]:
    docs = await db.assignments.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return [Assignment(**doc) for doc in docs]


@router.post("/assignments", response_model=Assignment)
async def create_assignment(payload: AssignmentCreate) -> Assignment:
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
    record = assignment.model_dump()
    if assignment.salary is not None:
        record["salary"] = str(assignment.salary)
    await db.assignments.insert_one(record)
    return assignment


@router.patch("/assignments/{assignment_id}", response_model=Assignment)
async def update_assignment(assignment_id: str, payload: AssignmentUpdate) -> Assignment:
    changes = payload.model_dump(mode="json", exclude_unset=True)
    if not changes or any(key in changes and changes[key] is None for key in ("status", "salary_basis")):
        raise HTTPException(status_code=422, detail="Enter employee details, salary or a valid assignment status")
    doc = await db.assignments.find_one_and_update(
        {"id": assignment_id}, {"$set": changes}, return_document=True,
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Assignment not found")
    doc.pop("_id", None)
    return Assignment(**doc)


@router.delete("/assignments/{assignment_id}")
async def delete_assignment(assignment_id: str) -> dict[str, bool]:
    result = await db.assignments.delete_one({"id": assignment_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return {"ok": True}

"""Pydantic v2 models for Brothers Workforce Solutions. Mirror these in frontend/src/types.ts."""

import uuid
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid() -> str:
    return str(uuid.uuid4())


# ---------- Worker applications ----------
class WorkerCreate(BaseModel):
    full_name: str
    mobile: str
    whatsapp: Optional[str] = None
    age: Optional[str] = None
    gender: Optional[str] = None
    current_location: str
    education: Optional[str] = None
    experience: Optional[str] = None
    skill_category: str
    skills: Optional[str] = None
    previous_experience: Optional[str] = None
    preferred_location: Optional[str] = None
    expected_salary: Optional[str] = None
    availability: Optional[str] = None


class Worker(WorkerCreate):
    id: str = Field(default_factory=_uid)
    resume_filename: Optional[str] = None
    status: str = "New"
    created_at: datetime = Field(default_factory=_now)


# ---------- Company manpower requests ----------
class CompanyRequestCreate(BaseModel):
    company_name: str
    contact_person: str
    designation: Optional[str] = None
    mobile: str
    email: str
    company_location: str
    industry: str
    workforce_type: str
    job_role: str
    worker_count: str
    shift_details: Optional[str] = None
    joining_date: Optional[str] = None
    work_location: Optional[str] = None
    description: Optional[str] = None


class CompanyRequest(CompanyRequestCreate):
    id: str = Field(default_factory=_uid)
    status: str = "Pending"
    created_at: datetime = Field(default_factory=_now)


# ---------- Job listings ----------
class JobCreate(BaseModel):
    title: str
    location: str
    skill_category: str
    experience: Optional[str] = None
    salary: Optional[str] = None
    shift: Optional[str] = None
    openings: int = 1
    description: Optional[str] = None


class Job(JobCreate):
    id: str = Field(default_factory=_uid)
    active: bool = True
    created_at: datetime = Field(default_factory=_now)


class StatusUpdate(BaseModel):
    status: str


class ActiveUpdate(BaseModel):
    active: bool


class AdminStats(BaseModel):
    workers: int
    requests: int
    open_requests: int
    active_jobs: int


class Ok(BaseModel):
    ok: bool

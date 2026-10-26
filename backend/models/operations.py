"""Private operational records. References point to the existing company/worker master."""
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from lib.months import MONTH_PATTERN

Identifier = Annotated[str, Field(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")]
Hours = Annotated[Decimal, Field(ge=0, le=24, decimal_places=2, allow_inf_nan=False)]
ShiftName = Literal["General", "Morning", "Afternoon", "Night"]
AttendanceStatus = Literal[
    "Unmarked", "Present", "Absent", "Half-day", "Paid leave",
    "Unpaid leave", "Leave", "Holiday", "Weekly off",
]


class OperationalModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class AttendanceRow(OperationalModel):
    assignment_id: Identifier
    status: AttendanceStatus = "Unmarked"
    shift: ShiftName = "General"
    overtime_hours: Hours = Decimal("0")

    @model_validator(mode="after")
    def overtime_requires_work(self):
        if self.overtime_hours and self.status not in {"Present", "Half-day"}:
            raise ValueError("Overtime requires Present or Half-day attendance")
        return self


class AttendanceInput(OperationalModel):
    company_id: Identifier
    attendance_date: date
    revision: int | None = Field(default=None, ge=1)
    rows: list[AttendanceRow] = Field(min_length=1, max_length=2000)
    notes: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def unique_people(self):
        if len({r.assignment_id for r in self.rows}) != len(self.rows):
            raise ValueError("An employee can appear only once per day")
        return self


class AttendanceSnapshot(AttendanceRow):
    full_name: str
    worker_id: str | None = None
    employee_id: str | None = None
    role: str = ""
    check_in_at: datetime | None = None
    check_out_at: datetime | None = None
    employee_approved_at: datetime | None = None
    attendance_source: Literal["Owner", "Employee self-service"] | None = None


class AttendanceRecord(OperationalModel):
    id: Identifier
    company_id: Identifier
    company_name: str
    attendance_date: str
    revision: int
    rows: list[AttendanceSnapshot] = Field(min_length=1, max_length=2000)
    notes: str = ""
    status: Literal["Draft", "Approved"]
    approved_by: str | None = None
    approved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class VersionInput(OperationalModel):
    revision: int = Field(ge=1)


class RequirementInput(OperationalModel):
    company_id: Identifier
    role: str = Field(min_length=1, max_length=150)
    required_count: int = Field(ge=0, le=100000)
    needed_date: date
    follow_up_date: date | None = None
    status: Literal["Open", "Closed"] = "Open"
    notes: str = Field(default="", max_length=1000)
    revision: int | None = Field(default=None, ge=1)


class RequirementRecord(RequirementInput):
    id: Identifier
    company_name: str
    created_at: datetime
    updated_at: datetime


class RecruitmentInput(OperationalModel):
    worker_id: Identifier
    company_id: Identifier | None = None
    job_id: Identifier | None = None
    shortlist_id: Identifier | None = None
    stage: Literal["Contacted", "Interview", "Selected", "Joining Scheduled", "Joined", "No-show", "Rejected", "Withdrawn"] = "Contacted"
    interview_date: date | None = None
    joining_date: date | None = None
    follow_up_date: date | None = None
    notes: str = Field(default="", max_length=1000)
    revision: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def context_and_dates(self):
        if not any((self.company_id, self.job_id, self.shortlist_id)):
            raise ValueError("Select a company, job or shortlist for this recruitment record")
        if self.stage == "Interview" and not self.interview_date:
            raise ValueError("Enter an interview date")
        if self.stage in {"Joining Scheduled", "Joined", "No-show"} and not self.joining_date:
            raise ValueError("Enter the joining date")
        return self


class RecruitmentRecord(RecruitmentInput):
    id: Identifier
    worker_name: str
    company_name: str = ""
    job_title: str = ""
    shortlist_name: str = ""
    created_at: datetime
    updated_at: datetime


class DocumentInput(OperationalModel):
    company_id: Identifier | None = None
    worker_id: Identifier | None = None
    title: str = Field(min_length=1, max_length=150)
    category: Literal["Company agreement", "Worker onboarding", "Payment receipt", "Other"] = "Other"
    status: Literal["Missing", "Received", "Verified", "Not required"] = "Missing"
    expiry_date: date | None = None
    follow_up_date: date | None = None
    notes: str = Field(default="", max_length=1000)
    revision: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def owner_required(self):
        if bool(self.company_id) == bool(self.worker_id):
            raise ValueError("Link this document to either a company or a worker")
        return self


class DocumentRecord(DocumentInput):
    id: Identifier
    entity_name: str
    filename: str | None = Field(default=None, max_length=150, pattern=r"^[A-Za-z0-9._-]+$")
    content_type: Literal["application/pdf", "image/jpeg", "image/png"] | None = None
    created_at: datetime
    updated_at: datetime


class AuditRecord(BaseModel):
    id: Identifier
    at: datetime
    actor: str
    actor_id: str | None = None
    role: str
    method: str
    path: str
    action: str
    subject: str = ""

"""Employee self-service check-in/out backed by the shared attendance register."""

import hashlib
import hmac
import re
import secrets
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from lib.auth import _hash_pin, require_owner
from lib.db import db
from lib.ledger import today
from models.operations import ShiftName
from routers.operations import (
    CONFLICT,
    active_on,
    attendance_row_payroll_ready,
    clean,
    key,
    roster,
    write_record,
)

router = APIRouter(prefix="/employee-attendance")
admin_router = APIRouter(prefix="/admin/operations/attendance/access", dependencies=[Depends(require_owner)])

EMPLOYEE_SESSION_SECONDS = 24 * 60 * 60
MAX_LOGIN_ATTEMPTS = 8
LOGIN_WINDOW = timedelta(minutes=15)


class EmployeeModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class EmployeeLoginInput(EmployeeModel):
    employee_id: str = Field(min_length=1, max_length=80)
    pin: str = Field(pattern=r"^\d{6}$")

    @field_validator("employee_id")
    @classmethod
    def employee_id_required(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Enter your employee ID")
        return value


class EmployeePinInput(EmployeeModel):
    pin: str = Field(pattern=r"^\d{6}$")


class CheckInInput(EmployeeModel):
    shift: ShiftName


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _attempt_id(request: Request, employee_id: str) -> str:
    ip = request.client.host if request.client else "unknown"
    return hashlib.sha256(f"{ip}|{employee_id.casefold()}".encode()).hexdigest()


async def _active_company(assignment: dict) -> bool:
    if assignment.get("company_archived"):
        return False
    company = await db.clients.find_one({"id": assignment["client_id"], "archived": {"$ne": True}}, {"_id": 0, "id": 1})
    return bool(company)


async def _employee_candidates(employee_id: str) -> list[dict]:
    employee_id = employee_id.strip()
    rows = await db.assignments.find({"employee_id_key": employee_id.casefold()}, {"_id": 0}).to_list(25)
    if not rows:
        rows = await db.assignments.find(
            {"employee_id": {"$regex": rf"^{re.escape(employee_id)}$", "$options": "i"}}, {"_id": 0},
        ).to_list(25)
    day = today()
    return [row for row in rows if active_on(row, day) and await _active_company(row)]


async def require_employee(request: Request) -> None:
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(401, "Please sign in again")
    now = datetime.now(timezone.utc)
    session = await db.employee_attendance_sessions.find_one({
        "token_hash": _token_hash(token.strip()), "expires_at": {"$gt": now},
    })
    if not session:
        raise HTTPException(401, "Session expired. Please sign in again")
    assignment = await db.assignments.find_one({"id": session["assignment_id"]}, {"_id": 0})
    if (
        not assignment
        or not assignment.get("attendance_access_enabled")
        or assignment.get("attendance_access_version", 0) != session.get("access_version", 0)
        or not active_on(assignment, today())
        or not await _active_company(assignment)
    ):
        await db.employee_attendance_sessions.delete_one({"token_hash": session["token_hash"]})
        raise HTTPException(401, "Attendance access is no longer active. Contact your manager.")
    request.state.employee = assignment
    request.state.employee_session = session


def _snapshot(person: dict) -> dict:
    return {
        "assignment_id": person["id"], "full_name": person["full_name"],
        "worker_id": person.get("worker_id"), "employee_id": person.get("employee_id"),
        "role": person.get("role") or "", "shift": person.get("shift") or "General",
        "status": "Unmarked", "overtime_hours": "0",
    }


def _employee_row(sheet: dict, assignment_id: str) -> dict | None:
    return next((row for row in sheet.get("rows", []) if row.get("assignment_id") == assignment_id), None)


def _state(sheet: dict | None, row: dict | None, fallback_date: str) -> dict:
    if not sheet or not row:
        return {
            "attendance_date": fallback_date, "state": "not_checked_in", "status": "Unmarked",
            "shift": None, "check_in_at": None, "check_out_at": None, "payroll_ready": False,
        }
    payroll_ready = attendance_row_payroll_ready(sheet, row)
    state = "checked_in" if row.get("check_in_at") and not row.get("check_out_at") else "completed" if payroll_ready else "not_checked_in"
    return {
        "attendance_date": sheet["attendance_date"], "state": state, "status": row.get("status", "Unmarked"),
        "shift": row.get("shift") or "General", "check_in_at": row.get("check_in_at"),
        "check_out_at": row.get("check_out_at"), "payroll_ready": payroll_ready,
    }


async def _dashboard(assignment: dict) -> dict:
    current_day = today()
    start = (date.fromisoformat(current_day) - timedelta(days=13)).isoformat()
    sheets = await db.attendance.find(
        {"company_id": assignment["client_id"], "attendance_date": {"$gte": start, "$lte": current_day}}, {"_id": 0},
    ).sort("attendance_date", -1).to_list(14)
    recent = []
    active = None
    today_item = None
    for sheet in sheets:
        row = _employee_row(sheet, assignment["id"])
        if not row:
            continue
        item = _state(sheet, row, current_day)
        if item["state"] == "checked_in" and active is None:
            active = item
        if sheet["attendance_date"] == current_day:
            today_item = item
        if item["status"] != "Unmarked" or item["check_in_at"]:
            recent.append(item)
    return {
        "employee": {
            "assignment_id": assignment["id"], "employee_id": assignment.get("employee_id"),
            "full_name": assignment["full_name"], "company_name": assignment.get("company_name") or "",
            "role": assignment.get("role") or "", "assigned_shift": assignment.get("shift") or "General",
        },
        "server_date": current_day,
        "today": active or today_item or _state(None, None, current_day),
        "recent": recent,
    }


async def _recent_sheets(assignment: dict) -> list[dict]:
    current_day = date.fromisoformat(today())
    return await db.attendance.find({
        "company_id": assignment["client_id"],
        "attendance_date": {"$gte": (current_day - timedelta(days=1)).isoformat(), "$lte": current_day.isoformat()},
    }, {"_id": 0}).sort("attendance_date", -1).to_list(2)


async def _change_attendance(assignment: dict, attendance_date: str, action: str, shift: ShiftName | None = None) -> None:
    sheet_id = key("attendance", assignment["client_id"], attendance_date)
    for attempt in range(3):
        sheet = await db.attendance.find_one({"id": sheet_id}, {"_id": 0})
        if not sheet:
            if action != "check_in":
                raise HTTPException(409, "Check in before checking out")
            people = await roster(assignment["client_id"], attendance_date)
            company = await db.clients.find_one({"id": assignment["client_id"], "archived": {"$ne": True}})
            if not company or assignment["id"] not in {person["id"] for person in people}:
                raise HTTPException(409, "You are not active in this company's workforce today")
            sheet = {
                "company_id": assignment["client_id"], "company_name": company["name"],
                "attendance_date": attendance_date, "rows": [_snapshot(person) for person in people],
                "notes": "", "status": "Draft", "approved_by": None, "approved_at": None,
            }
            revision = None
        else:
            revision = sheet["revision"]
        row = _employee_row(sheet, assignment["id"])
        if not row:
            raise HTTPException(409, "Your workforce record changed. Contact your manager.")
        now = datetime.now(timezone.utc).isoformat()
        if action == "check_in":
            if sheet.get("status") == "Approved" or attendance_row_payroll_ready(sheet, row):
                raise HTTPException(409, "Today's attendance is already approved")
            if row.get("check_in_at") and not row.get("check_out_at"):
                raise HTTPException(409, "You are already checked in")
            if row.get("check_out_at"):
                raise HTTPException(409, "You already completed attendance for today")
            row.update({
                "status": "Present", "shift": shift or assignment.get("shift") or "General",
                "overtime_hours": "0", "check_in_at": now, "attendance_source": "Employee self-service",
            })
            row.pop("check_out_at", None)
            row.pop("employee_approved_at", None)
        else:
            if not row.get("check_in_at"):
                raise HTTPException(409, "Check in before checking out")
            if row.get("check_out_at"):
                raise HTTPException(409, "You are already checked out")
            row.update({
                "status": "Present", "check_out_at": now, "employee_approved_at": now,
                "attendance_source": "Employee self-service",
            })
        values = {field: value for field, value in clean(sheet).items() if field not in {"id", "revision", "created_at", "updated_at"}}
        try:
            await write_record("attendance", sheet_id, values, revision)
            return
        except HTTPException as error:
            if error.status_code != 409 or attempt == 2:
                raise
    raise HTTPException(409, CONFLICT)


@admin_router.get("")
async def list_employee_access(company_id: str):
    if not await db.clients.find_one({"id": company_id, "archived": {"$ne": True}}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Company not found")
    assignments = await db.assignments.find({"client_id": company_id}, {"_id": 0}).sort("full_name", 1).to_list(2001)
    if len(assignments) > 2000:
        raise HTTPException(422, "Attendance supports up to 2000 employees per company")
    day = today()
    return [{
        "assignment_id": row["id"], "full_name": row["full_name"], "employee_id": row.get("employee_id"),
        "role": row.get("role") or "", "shift": row.get("shift") or "General",
        "access_enabled": bool(row.get("attendance_access_enabled") and row.get("attendance_pin_hash")),
    } for row in assignments if active_on(row, day)]


@admin_router.put("/{assignment_id}")
async def set_employee_pin(assignment_id: str, payload: EmployeePinInput):
    assignment = await db.assignments.find_one({"id": assignment_id})
    if not assignment or not await _active_company(assignment):
        raise HTTPException(404, "Employee not found")
    if not assignment.get("employee_id"):
        raise HTTPException(422, "Add an employee ID in Company Workforce before enabling access")
    salt = secrets.token_hex(16)
    await db.assignments.update_one({"id": assignment_id}, {
        "$set": {
            "attendance_pin_salt": salt, "attendance_pin_hash": _hash_pin(payload.pin, salt),
            "attendance_access_enabled": True,
        },
        "$inc": {"attendance_access_version": 1},
    })
    await db.employee_attendance_sessions.delete_many({"assignment_id": assignment_id})
    return {"ok": True, "assignment_id": assignment_id, "access_enabled": True}


@admin_router.delete("/{assignment_id}")
async def disable_employee_access(assignment_id: str):
    assignment = await db.assignments.find_one({"id": assignment_id})
    if not assignment:
        raise HTTPException(404, "Employee not found")
    await db.assignments.update_one({"id": assignment_id}, {
        "$set": {"attendance_access_enabled": False},
        "$unset": {"attendance_pin_salt": "", "attendance_pin_hash": ""},
        "$inc": {"attendance_access_version": 1},
    })
    await db.employee_attendance_sessions.delete_many({"assignment_id": assignment_id})
    return {"ok": True, "assignment_id": assignment_id, "access_enabled": False}


@router.post("/login")
async def employee_login(payload: EmployeeLoginInput, request: Request):
    now = datetime.now(timezone.utc)
    attempt_id = _attempt_id(request, payload.employee_id)
    await db.employee_login_attempts.delete_many({"id": attempt_id, "expires_at": {"$lte": now}})
    attempt = await db.employee_login_attempts.find_one({"id": attempt_id, "expires_at": {"$gt": now}})
    if attempt and attempt.get("count", 0) >= MAX_LOGIN_ATTEMPTS:
        raise HTTPException(429, "Too many attempts. Try again in 15 minutes.")
    candidates = await _employee_candidates(payload.employee_id)
    valid = []
    checked_hash = False
    for candidate in candidates:
        salt, pin_hash = candidate.get("attendance_pin_salt"), candidate.get("attendance_pin_hash")
        if not salt or not pin_hash:
            continue
        checked_hash = True
        pin_matches = hmac.compare_digest(_hash_pin(payload.pin, salt), pin_hash)
        if candidate.get("attendance_access_enabled") and pin_matches:
            valid.append(candidate)
    if not checked_hash:
        _hash_pin(payload.pin, "00" * 16)
    if len(valid) != 1:
        await db.employee_login_attempts.update_one(
            {"id": attempt_id}, {"$inc": {"count": 1}, "$set": {"expires_at": now + LOGIN_WINDOW}}, upsert=True,
        )
        raise HTTPException(401, "Invalid employee ID or PIN")
    await db.employee_login_attempts.delete_many({"id": attempt_id})
    assignment = valid[0]
    token = secrets.token_urlsafe(32)
    await db.employee_attendance_sessions.insert_one({
        "_id": _token_hash(token), "token_hash": _token_hash(token), "assignment_id": assignment["id"],
        "access_version": assignment.get("attendance_access_version", 0), "created_at": now,
        "expires_at": now + timedelta(seconds=EMPLOYEE_SESSION_SECONDS),
    })
    return {"ok": True, "token": token, "expires_in": EMPLOYEE_SESSION_SECONDS}


@router.get("/me", dependencies=[Depends(require_employee)])
async def employee_me(request: Request):
    return await _dashboard(request.state.employee)


@router.post("/check-in", dependencies=[Depends(require_employee)])
async def employee_check_in(payload: CheckInInput, request: Request):
    assignment = request.state.employee
    for sheet in await _recent_sheets(assignment):
        row = _employee_row(sheet, assignment["id"])
        if row and row.get("check_in_at") and not row.get("check_out_at"):
            raise HTTPException(409, f"You are already checked in for {sheet['attendance_date']}")
    await _change_attendance(assignment, today(), "check_in", payload.shift)
    return await _dashboard(assignment)


@router.post("/check-out", dependencies=[Depends(require_employee)])
async def employee_check_out(request: Request):
    assignment = request.state.employee
    open_sheet = None
    for sheet in await _recent_sheets(assignment):
        row = _employee_row(sheet, assignment["id"])
        if row and row.get("check_in_at") and not row.get("check_out_at"):
            open_sheet = sheet
            break
    if not open_sheet:
        raise HTTPException(409, "Check in before checking out")
    await _change_attendance(assignment, open_sheet["attendance_date"], "check_out")
    return await _dashboard(assignment)


@router.post("/logout", dependencies=[Depends(require_employee)])
async def employee_logout(request: Request):
    await db.employee_attendance_sessions.delete_one({"token_hash": request.state.employee_session["token_hash"]})
    return {"ok": True}

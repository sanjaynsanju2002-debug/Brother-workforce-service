"""Daily attendance reporting shared by the owner dashboard and email scheduler."""

from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from lib.db import db

INDIA = ZoneInfo("Asia/Kolkata")
SHIFT_ORDER = {"General": 0, "Morning": 1, "Afternoon": 2, "Night": 3}
WORKED_STATUSES = {"Present", "Half-day"}


def _active_on(row: dict, day: str) -> bool:
    if row.get("company_archived") or (row.get("start_date") and row["start_date"] > day):
        return False
    if row.get("end_date") and row["end_date"] < day:
        return False
    return row.get("status", "Active") == "Active" or bool(row.get("end_date"))


def _timestamp(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _india_time(value) -> str | None:
    parsed = _timestamp(value)
    return parsed.astimezone(INDIA).strftime("%I:%M %p") if parsed else None


def _worked_hours(check_in, check_out) -> Decimal | None:
    start, end = _timestamp(check_in), _timestamp(check_out)
    if not start or not end or end < start:
        return None
    hours = Decimal(str((end - start).total_seconds())) / Decimal("3600")
    return hours.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _record_state(row: dict, status: str) -> str:
    if row.get("check_in_at") and row.get("check_out_at"):
        return "Completed"
    if row.get("check_in_at"):
        return "Missing check-out"
    if status in WORKED_STATUSES:
        return "Manual record"
    if status == "Unmarked":
        return "Not marked"
    return status


async def daily_attendance_report_data(company_id: str, report_date: date | str) -> dict:
    """Return one company/day report with actual India-time punches and shift totals."""
    day = report_date.isoformat() if isinstance(report_date, date) else report_date
    company = await db.clients.find_one({"id": company_id}, {"_id": 0})
    if not company:
        raise HTTPException(404, "Company not found")

    sheet = await db.attendance.find_one(
        {"company_id": company_id, "attendance_date": day}, {"_id": 0},
    )
    if sheet:
        source_rows = list(sheet.get("rows", []))
    else:
        assignments = await db.assignments.find({"client_id": company_id}, {"_id": 0}).to_list(2001)
        if len(assignments) > 2000:
            raise HTTPException(422, "Attendance supports up to 2000 employees per company")
        source_rows = [{
            "assignment_id": row["id"],
            "employee_id": row.get("employee_id"),
            "full_name": row["full_name"],
            "role": row.get("role") or "",
            "shift": row.get("shift") or "General",
            "status": "Unmarked",
            "overtime_hours": "0",
        } for row in assignments if _active_on(row, day)]

    rows = []
    status_counts: dict[str, int] = {}
    shifts = {
        name: {"shift": name, "employees": 0, "worked": 0, "completed": 0, "missing_check_out": 0}
        for name in SHIFT_ORDER
    }
    total_hours = Decimal("0")
    for source in source_rows:
        status = "Unpaid leave" if source.get("status") == "Leave" else source.get("status", "Unmarked")
        shift = source.get("shift") or "General"
        if shift not in shifts:
            shift = "General"
        hours = _worked_hours(source.get("check_in_at"), source.get("check_out_at"))
        payroll_ready = bool(sheet and (sheet.get("status") == "Approved" or source.get("employee_approved_at")))
        state = _record_state(source, status)
        worked = status in WORKED_STATUSES
        if status != "Unmarked":
            status_counts[status] = status_counts.get(status, 0) + 1
        shifts[shift]["employees"] += 1
        if worked:
            shifts[shift]["worked"] += 1
        if state in {"Completed", "Manual record"} and worked:
            shifts[shift]["completed"] += 1
        if state == "Missing check-out":
            shifts[shift]["missing_check_out"] += 1
        if hours is not None:
            total_hours += hours
        rows.append({
            "assignment_id": source["assignment_id"],
            "employee_id": source.get("employee_id"),
            "full_name": source.get("full_name") or "Employee",
            "role": source.get("role") or "",
            "shift": shift,
            "status": status,
            "check_in_at": source.get("check_in_at"),
            "check_out_at": source.get("check_out_at"),
            "check_in_time": _india_time(source.get("check_in_at")),
            "check_out_time": _india_time(source.get("check_out_at")),
            "worked_hours": f"{hours:.2f}" if hours is not None else None,
            "overtime_hours": str(source.get("overtime_hours") or "0"),
            "record_state": state,
            "payroll_ready": payroll_ready,
            "attendance_source": source.get("attendance_source") or "Owner",
        })

    rows.sort(key=lambda row: (SHIFT_ORDER.get(row["shift"], 99), row["full_name"].casefold()))
    delivery = await db.attendance_report_deliveries.find_one(
        {"id": f"attendance-report:{company_id}:{day}"}, {"_id": 0, "status": 1, "sent_at": 1, "detail": 1},
    )
    worked_rows = [row for row in rows if row["status"] in WORKED_STATUSES]
    return {
        "company_id": company_id,
        "company_name": company["name"],
        "report_date": day,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sheet_status": sheet.get("status") if sheet else "Not saved",
        "notes": sheet.get("notes", "") if sheet else "",
        "rows": rows,
        "shifts": list(shifts.values()),
        "status_counts": status_counts,
        "totals": {
            "employees": len(rows),
            "worked": len(worked_rows),
            "completed": sum(row["record_state"] in {"Completed", "Manual record"} for row in worked_rows),
            "missing_check_out": sum(row["record_state"] == "Missing check-out" for row in rows),
            "payroll_ready": sum(row["payroll_ready"] for row in rows),
            "worked_hours": f"{total_hours:.2f}",
        },
        "email_delivery": delivery or {"status": "scheduled"},
        "email_schedule": "8:00 AM IST on the following morning",
    }

"""Attendance approval, staffing, recruitment, private documents and daily operations."""
import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile
from pymongo.errors import DuplicateKeyError
from starlette.concurrency import run_in_threadpool

from lib.auth import require_admin, require_owner
from lib.daily_attendance import daily_attendance_report_data
from lib.db import db
from lib.ledger import amount, money, received, salary_paid, today
from lib.invoices import InvoiceProfile
from lib.months import MONTH_PATTERN, service_month
from models.operations import AttendanceInput, AttendanceRecord, DocumentInput, DocumentRecord, RecruitmentInput, RecruitmentRecord, RequirementInput, RequirementRecord, VersionInput

router = APIRouter(prefix="/admin/operations", dependencies=[Depends(require_admin)])
CONFLICT = "This record changed in another session. Reload it before saving."


def key(*parts):
    return str(uuid5(NAMESPACE_URL, "bws:operations:" + ":".join(str(p) for p in parts)))


def clean(doc):
    return {k: v for k, v in doc.items() if k not in {"_id", "file_data"}}


async def company(company_id, active=True):
    query = {"id": company_id}
    if active:
        query["archived"] = {"$ne": True}
    doc = await db.clients.find_one(query)
    if not doc:
        raise HTTPException(404, "Company not found. Add or restore it in Company Workforce.")
    return doc


async def write_record(collection, record_id, values, revision):
    coll = db[collection]
    existing = await coll.find_one({"id": record_id})
    if (existing and existing.get("revision") != revision) or (not existing and revision is not None):
        raise HTTPException(409, CONFLICT)
    now = datetime.now(timezone.utc).isoformat()
    doc = {**values, "id": record_id, "revision": (revision or 0) + 1,
           "created_at": existing["created_at"] if existing else now, "updated_at": now}
    if existing:
        result = await coll.update_one({"id": record_id, "revision": revision}, {"$set": doc})
        if not result.matched_count:
            raise HTTPException(409, CONFLICT)
        return {**clean(existing), **doc}
    try:
        await coll.insert_one({"_id": record_id, **doc})
    except DuplicateKeyError:
        raise HTTPException(409, CONFLICT)
    return doc


def active_on(row, day):
    if row.get("company_archived") or (row.get("start_date") and row["start_date"] > day):
        return False
    if row.get("end_date") and row["end_date"] < day:
        return False
    return row.get("status", "Active") == "Active" or bool(row.get("end_date"))


async def roster(company_id, day):
    records = await db.assignments.find({"client_id": company_id}, {"_id": 0}).to_list(2001)
    if len(records) > 2000:
        raise HTTPException(422, "Attendance supports up to 2000 employees per company")
    return [{**r, "shift": r.get("shift") or "General"} for r in records if active_on(r, day)]


def attendance_row_payroll_ready(sheet: dict, row: dict) -> bool:
    """A full owner approval or a completed employee check-out can feed payroll."""
    return sheet.get("status") == "Approved" or bool(row.get("employee_approved_at"))


@router.get("/attendance-companies")
async def attendance_companies():
    """Minimal company list for the separately hosted attendance application."""
    docs = await db.clients.find(
        {"archived": {"$ne": True}}, {"_id": 0, "id": 1, "name": 1},
    ).sort("sort_order", 1).to_list(200)
    return [{"id": row["id"], "name": row["name"]} for row in docs]


@router.get("/attendance")
async def attendance_draft(company_id: str, attendance_date: date):
    c = await company(company_id, active=False)
    day = attendance_date.isoformat()
    saved = await db.attendance.find_one({"id": key("attendance", company_id, day)}, {"_id": 0})
    return {"company_name": c["name"], "employees": await roster(company_id, day), "sheet": saved}


@router.get("/attendance-daily-report")
async def attendance_daily_report(company_id: str, report_date: date):
    """One company/day report with shifts, India-time punches and worked hours."""
    return await daily_attendance_report_data(company_id, report_date)


@router.get("/attendance-daily-report/download/{format}")
async def download_attendance_daily_report(format: str, company_id: str, report_date: date):
    if format not in {"csv", "xlsx", "pdf"}:
        raise HTTPException(404, "Choose CSV, Excel or PDF")
    from lib.attendance_exports import (
        export_attendance_daily_csv,
        export_attendance_daily_pdf,
        export_attendance_daily_xlsx,
    )
    report = await daily_attendance_report_data(company_id, report_date)
    settings = await db.settings.find_one({"id": "invoice_profile"})
    supplier = InvoiceProfile(**(settings or {}).get("profile", {}))
    exporters = {
        "csv": export_attendance_daily_csv,
        "xlsx": export_attendance_daily_xlsx,
        "pdf": export_attendance_daily_pdf,
    }
    content = await run_in_threadpool(exporters[format], report, supplier)
    company_name = re.sub(r"[^A-Za-z0-9]+", "-", report["company_name"]).strip("-")[:50] or "Company"
    filename = f"BWS-Daily-Attendance-{company_name}-{report['report_date']}.{format}"
    media = {
        "csv": "text/csv; charset=utf-8",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "pdf": "application/pdf",
    }[format]
    return Response(content, media_type=media, headers={
        "Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "private, no-store",
    })


@router.put("/attendance", response_model=AttendanceRecord)
async def save_attendance(payload: AttendanceInput):
    c = await company(payload.company_id)
    day = payload.attendance_date.isoformat()
    sheet_id = key("attendance", payload.company_id, day)
    existing = await db.attendance.find_one({"id": sheet_id})
    if existing and existing["status"] == "Approved":
        raise HTTPException(409, "Reopen the approved sheet before changing attendance")
    people = {p["id"]: p for p in await roster(payload.company_id, day)}
    if set(people) != {r.assignment_id for r in payload.rows}:
        raise HTTPException(409, "The workforce changed. Reload attendance and review every employee for this date.")
    old_rows = {row["assignment_id"]: row for row in (existing or {}).get("rows", [])}
    rows = []
    for row in payload.rows:
        saved = old_rows.get(row.assignment_id, {})
        record = {**row.model_dump(mode="json"), "full_name": people[row.assignment_id]["full_name"],
                  "worker_id": people[row.assignment_id].get("worker_id"), "employee_id": people[row.assignment_id].get("employee_id"),
                  "role": people[row.assignment_id].get("role") or ""}
        for field in ("check_in_at", "check_out_at", "attendance_source"):
            if saved.get(field):
                record[field] = saved[field]
        if saved.get("employee_approved_at"):
            record["employee_approved_at"] = saved["employee_approved_at"]
        rows.append(record)
    return await write_record("attendance", sheet_id, {"company_id": payload.company_id, "company_name": c["name"],
        "attendance_date": day, "rows": rows, "notes": payload.notes, "status": "Draft", "approved_by": None, "approved_at": None}, payload.revision)


@router.post("/attendance/{sheet_id}/{action}", response_model=AttendanceRecord)
async def attendance_action(sheet_id: str, action: str, payload: VersionInput, request: Request):
    if action not in {"approve", "reopen"}:
        raise HTTPException(404, "Choose approve or reopen")
    doc = await db.attendance.find_one({"id": sheet_id})
    if not doc:
        raise HTTPException(404, "Attendance not found")
    await company(doc["company_id"])
    if action == "approve":
        if doc["status"] != "Draft" or doc["attendance_date"] > today():
            raise HTTPException(422, "Only a draft for today or an earlier date can be approved")
        if any(r["status"] == "Unmarked" for r in doc["rows"]):
            raise HTTPException(422, "Mark every employee before approving attendance")
        if {r["assignment_id"] for r in doc["rows"]} != {r["id"] for r in await roster(doc["company_id"], doc["attendance_date"])}:
            raise HTTPException(409, "The workforce changed. Reload and save the attendance draft again.")
    elif doc["status"] != "Approved":
        raise HTTPException(422, "This sheet is already a draft")
    values = {k: v for k, v in clean(doc).items() if k not in {"id", "revision", "created_at", "updated_at"}}
    values.update(status="Approved" if action == "approve" else "Draft",
                  approved_by=request.state.admin["name"] if action == "approve" else None,
                  approved_at=datetime.now(timezone.utc).isoformat() if action == "approve" else None)
    return await write_record("attendance", sheet_id, values, payload.revision)


async def attendance_totals(company_id, month):
    sheets = await db.attendance.find({"company_id": company_id, "attendance_date": {"$gte": month + "-01", "$lt": month + "-32"}}, {"_id": 0}).sort("attendance_date", 1).to_list(32)
    people = {}
    status_counts = {}
    contributing_sheets = []
    paid_values = {
        "Present": Decimal("1"), "Half-day": Decimal("0.5"),
        "Paid leave": Decimal("1"), "Holiday": Decimal("1"), "Weekly off": Decimal("1"),
    }
    for sheet in sheets:
        contributes = False
        for row in sheet["rows"]:
            if not attendance_row_payroll_ready(sheet, row):
                continue
            contributes = True
            summary = people.setdefault(row["assignment_id"], {"assignment_id": row["assignment_id"], "full_name": row["full_name"], "worked_days": Decimal("0"), "overtime_hours": Decimal("0"), "status_counts": {}})
            summary["worked_days"] += paid_values.get(row["status"], Decimal("0"))
            summary["overtime_hours"] += amount(row.get("overtime_hours"))
            summary["status_counts"][row["status"]] = summary["status_counts"].get(row["status"], 0) + 1
            status_counts[row["status"]] = status_counts.get(row["status"], 0) + 1
        if contributes:
            contributing_sheets.append(sheet)
    return {"lines": [{**r, "worked_days": money(r["worked_days"]), "overtime_hours": money(r["overtime_hours"])} for r in people.values()],
            "sheets": [{"id": s["id"], "date": s["attendance_date"], "revision": s["revision"]} for s in contributing_sheets],
            "approved_days": len(contributing_sheets), "status_counts": status_counts}


@router.get("/attendance-summary")
async def approved_attendance(company_id: str, month: str = Query(pattern=MONTH_PATTERN)):
    await company(company_id, active=False)
    return await attendance_totals(company_id, month)


async def attendance_register_data(company_id: str, month: str):
    c = await company(company_id, active=False)
    sheets = await db.attendance.find(
        {"company_id": company_id, "attendance_date": {"$gte": month + "-01", "$lt": month + "-32"}},
        {"_id": 0},
    ).sort("attendance_date", 1).to_list(32)
    people = {}
    for sheet in sheets:
        for row in sheet.get("rows", []):
            people.setdefault(row["assignment_id"], {
                "assignment_id": row["assignment_id"], "full_name": row["full_name"],
                "worker_id": row.get("worker_id"), "employee_id": row.get("employee_id"), "role": row.get("role") or "",
            })
    current = await roster(company_id, month + "-32")
    for row in current:
        people.setdefault(row["id"], {
            "assignment_id": row["id"], "full_name": row["full_name"],
            "worker_id": row.get("worker_id"), "employee_id": row.get("employee_id"), "role": row.get("role") or "",
        })
    return {
        "company_id": company_id, "company_name": c["name"], "month": month,
        "employees": sorted(people.values(), key=lambda row: row["full_name"].casefold()),
        "sheets": [clean(sheet) for sheet in sheets],
    }


async def attendance_weekly_report_data(company_id: str, week_start: date):
    """Build one Monday-Sunday report with draft visibility and approved totals."""
    if week_start.weekday() != 0:
        raise HTTPException(422, "Weekly reports must start on a Monday")
    c = await company(company_id, active=False)
    week_end = week_start + timedelta(days=6)
    start, end = week_start.isoformat(), week_end.isoformat()
    dates = [(week_start + timedelta(days=offset)).isoformat() for offset in range(7)]
    sheets = await db.attendance.find(
        {"company_id": company_id, "attendance_date": {"$gte": start, "$lte": end}},
        {"_id": 0},
    ).sort("attendance_date", 1).to_list(8)
    assignments = await db.assignments.find({"client_id": company_id}, {"_id": 0}).to_list(2001)
    if len(assignments) > 2000:
        raise HTTPException(422, "Attendance supports up to 2000 employees per company")

    people = {}
    for row in assignments:
        if any(active_on(row, day) for day in dates):
            people[row["id"]] = {
                "assignment_id": row["id"], "full_name": row["full_name"],
                "worker_id": row.get("worker_id"), "employee_id": row.get("employee_id"),
                "role": row.get("role") or "", "shift": row.get("shift") or "General",
            }
    for sheet in sheets:
        for row in sheet.get("rows", []):
            people.setdefault(row["assignment_id"], {
                "assignment_id": row["assignment_id"], "full_name": row["full_name"],
                "worker_id": row.get("worker_id"), "employee_id": row.get("employee_id"),
                "role": row.get("role") or "", "shift": row.get("shift") or "General",
            })

    sheet_by_date = {sheet["attendance_date"]: sheet for sheet in sheets}
    rows_by_date = {
        day: {row["assignment_id"]: row for row in sheet.get("rows", [])}
        for day, sheet in sheet_by_date.items()
    }
    paid_values = {
        "Present": Decimal("1"), "Half-day": Decimal("0.5"),
        "Paid leave": Decimal("1"), "Holiday": Decimal("1"), "Weekly off": Decimal("1"),
    }
    status_counts = {}
    total_payable = Decimal("0")
    total_overtime = Decimal("0")
    report_rows = []
    for person in sorted(people.values(), key=lambda row: row["full_name"].casefold()):
        employee_counts = {}
        employee_payable = Decimal("0")
        employee_overtime = Decimal("0")
        employee_days = []
        for day in dates:
            sheet = sheet_by_date.get(day)
            attendance_row = rows_by_date.get(day, {}).get(person["assignment_id"])
            status = attendance_row.get("status", "Unmarked") if attendance_row else "Unmarked"
            if status == "Leave":
                status = "Unpaid leave"
            overtime = amount(attendance_row.get("overtime_hours")) if attendance_row else Decimal("0")
            payroll_ready = bool(sheet and attendance_row and attendance_row_payroll_ready(sheet, attendance_row))
            employee_days.append({
                "date": day, "status": status,
                "shift": attendance_row.get("shift", person["shift"]) if attendance_row else person["shift"],
                "overtime_hours": money(overtime),
                "sheet_status": "Approved" if payroll_ready else sheet.get("status") if sheet else "Not saved",
            })
            if payroll_ready and status != "Unmarked":
                employee_counts[status] = employee_counts.get(status, 0) + 1
                status_counts[status] = status_counts.get(status, 0) + 1
                employee_payable += paid_values.get(status, Decimal("0"))
                employee_overtime += overtime
        total_payable += employee_payable
        total_overtime += employee_overtime
        report_rows.append({
            **person, "days": employee_days, "status_counts": employee_counts,
            "payable_days": money(employee_payable), "overtime_hours": money(employee_overtime),
        })

    calendar_days = []
    for day in dates:
        sheet = sheet_by_date.get(day)
        if not sheet:
            status = "Not saved"
        elif sheet.get("status") == "Approved":
            status = "Approved"
        elif any(attendance_row_payroll_ready(sheet, row) for row in sheet.get("rows", [])):
            status = "Partially approved"
        else:
            status = "Draft"
        calendar_days.append({"date": day, "status": status, "notes": sheet.get("notes", "") if sheet else ""})
    approved_days = sum(sheet.get("status") == "Approved" for sheet in sheets)
    payroll_ready_days = sum(any(attendance_row_payroll_ready(sheet, row) for row in sheet.get("rows", [])) for sheet in sheets)
    return {
        "company_id": company_id, "company_name": c["name"], "week_start": start, "week_end": end,
        "calendar_days": calendar_days, "saved_days": len(sheets), "approved_days": approved_days,
        "draft_days": len(sheets) - approved_days, "payroll_ready_days": payroll_ready_days,
        "employees": report_rows, "status_counts": status_counts,
        "totals": {"employees": len(report_rows), "payable_days": money(total_payable), "overtime_hours": money(total_overtime)},
    }


@router.get("/attendance-weekly-report")
async def attendance_weekly_report(company_id: str, week_start: date):
    return await attendance_weekly_report_data(company_id, week_start)


@router.get("/attendance-weekly-report/download/{format}")
async def download_attendance_weekly_report(format: str, company_id: str, week_start: date):
    if format not in {"csv", "xlsx", "pdf"}:
        raise HTTPException(404, "Choose CSV, Excel or PDF")
    from lib.attendance_exports import (
        export_attendance_weekly_csv,
        export_attendance_weekly_pdf,
        export_attendance_weekly_xlsx,
    )
    report = await attendance_weekly_report_data(company_id, week_start)
    settings = await db.settings.find_one({"id": "invoice_profile"})
    supplier = InvoiceProfile(**(settings or {}).get("profile", {}))
    exporters = {
        "csv": export_attendance_weekly_csv,
        "xlsx": export_attendance_weekly_xlsx,
        "pdf": export_attendance_weekly_pdf,
    }
    content = await run_in_threadpool(exporters[format], report, supplier)
    company_name = re.sub(r"[^A-Za-z0-9]+", "-", report["company_name"]).strip("-")[:50] or "Company"
    filename = f"BWS-Weekly-Attendance-{company_name}-{report['week_start']}-to-{report['week_end']}.{format}"
    media = {
        "csv": "text/csv; charset=utf-8",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "pdf": "application/pdf",
    }[format]
    return Response(content, media_type=media, headers={
        "Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "private, no-store",
    })


@router.get("/attendance-register")
async def attendance_register(company_id: str, month: str = Query(pattern=MONTH_PATTERN)):
    """Return the complete monthly register for the private attendance application."""
    return await attendance_register_data(company_id, month)


@router.get("/attendance-register/download/{format}")
async def download_attendance_register(format: str, company_id: str, month: str = Query(pattern=MONTH_PATTERN)):
    if format not in {"pdf", "xlsx"}:
        raise HTTPException(404, "Choose PDF or Excel")
    from lib.attendance_exports import export_attendance_pdf, export_attendance_xlsx
    register = await attendance_register_data(company_id, month)
    settings = await db.settings.find_one({"id": "invoice_profile"})
    supplier = InvoiceProfile(**(settings or {}).get("profile", {}))
    exporter = export_attendance_pdf if format == "pdf" else export_attendance_xlsx
    content = await run_in_threadpool(exporter, register, supplier)
    company_name = re.sub(r"[^A-Za-z0-9]+", "-", register["company_name"]).strip("-")[:50] or "Company"
    filename = f"BWS-Attendance-{company_name}-{month}.{format}"
    media = "application/pdf" if format == "pdf" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return Response(content, media_type=media, headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "private, no-store"})


@router.get("/requirements")
async def requirements():
    docs = await db.staffing_requirements.find({}, {"_id": 0}).sort("updated_at", -1).to_list(2000)
    companies = {c["id"]: c for c in await db.clients.find({}, {"id": 1, "archived": 1}).to_list(None)}
    assignments = await db.assignments.find({}, {"_id": 0}).to_list(None)
    sheets = await db.attendance.find({"attendance_date": today(), "status": "Approved"}, {"company_id": 1, "rows": 1}).to_list(None)
    present = {s["company_id"]: {r["assignment_id"] for r in s["rows"] if r["status"] in {"Present", "Half-day"}} for s in sheets}
    result = []
    for d in docs:
        deployed = [a for a in assignments if a["client_id"] == d["company_id"] and a.get("status", "Active") == "Active" and active_on(a, today()) and " ".join((a.get("role") or "").casefold().split()) == " ".join(d["role"].casefold().split())]
        archived = not companies.get(d["company_id"]) or companies[d["company_id"]].get("archived", False)
        result.append({**d, "company_archived": archived, "deployed": len(deployed),
                       "present": sum(a["id"] in present[d["company_id"]] for a in deployed) if d["company_id"] in present else None,
                       "shortage": max(0, d["required_count"] - len(deployed))})
    return result


@router.put("/requirements", response_model=RequirementRecord)
async def save_requirement(payload: RequirementInput):
    record_id = key("requirement", payload.company_id, " ".join(payload.role.casefold().split()))
    existing = await db.staffing_requirements.find_one({"id": record_id})
    c = await company(payload.company_id, active=not bool(existing))
    if c.get("archived") and payload.status == "Open":
        raise HTTPException(422, "Restore the company before reopening its staffing target")
    return await write_record("staffing_requirements", record_id, {**payload.model_dump(mode="json", exclude={"revision"}), "company_name": c["name"]}, payload.revision)


@router.get("/recruitment")
async def recruitment():
    return await db.recruitment.find({}, {"_id": 0}).sort("updated_at", -1).to_list(2000)


@router.put("/recruitment", response_model=RecruitmentRecord)
async def save_recruitment(payload: RecruitmentInput):
    record_id = key("recruitment", payload.worker_id, payload.company_id or "", payload.job_id or "", payload.shortlist_id or "")
    existing = await db.recruitment.find_one({"id": record_id})
    worker = await db.workers.find_one({"id": payload.worker_id})
    if existing and not worker:
        worker = {"full_name": existing["worker_name"]}
    if not worker or (worker.get("status") == "Archived" and not existing):
        raise HTTPException(404, "Worker profile not found or archived")
    c = await company(payload.company_id, active=not bool(existing)) if payload.company_id else None
    job = await db.jobs.find_one({"id": payload.job_id}) if payload.job_id else None
    shortlist = await db.shortlists.find_one({"id": payload.shortlist_id}) if payload.shortlist_id else None
    if (payload.job_id and not job and not existing) or (payload.shortlist_id and not shortlist and not existing):
        raise HTTPException(404, "The selected job or shortlist no longer exists")
    return await write_record("recruitment", record_id, {**payload.model_dump(mode="json", exclude={"revision"}), "worker_name": worker["full_name"],
        "company_name": c["name"] if c else "", "job_title": job["title"] if job else (existing or {}).get("job_title", ""), "shortlist_name": shortlist["name"] if shortlist else (existing or {}).get("shortlist_name", "")}, payload.revision)


@router.get("/documents")
async def documents():
    return await db.documents.find({}, {"_id": 0, "file_data": 0}).sort("updated_at", -1).to_list(2000)


@router.put("/documents/{document_id}", response_model=DocumentRecord)
async def save_document(document_id: UUID, payload: DocumentInput):
    old = await db.documents.find_one({"id": str(document_id)}, {"file_data": 0})
    c = await company(payload.company_id, active=not bool(old)) if payload.company_id else await db.workers.find_one({"id": payload.worker_id})
    if not c and old and old.get("worker_id") == payload.worker_id:
        c = {"full_name": old["entity_name"]}
    if not c:
        raise HTTPException(404, "Worker profile not found")
    if old and (old.get("company_id") != payload.company_id or old.get("worker_id") != payload.worker_id):
        raise HTTPException(422, "Keep this document linked to its original company or worker")
    values = {**payload.model_dump(mode="json", exclude={"revision"}), "entity_name": c.get("name") or c["full_name"]}
    return await write_record("documents", str(document_id), values, payload.revision)


@router.post("/documents/{document_id}/file", response_model=DocumentRecord)
async def attach_document(document_id: UUID, revision: int = Query(ge=1), file: UploadFile = File()):
    from routers.expenses import bill_values
    upload = await bill_values(file)
    doc = await db.documents.find_one({"id": str(document_id)}, {"file_data": 0})
    if not doc:
        raise HTTPException(404, "Document not found")
    result = await db.documents.update_one({"id": str(document_id), "revision": revision}, {"$set": {
        "file_data": upload["bill_data"], "filename": upload["bill_filename"], "content_type": upload["bill_content_type"],
        "status": "Received", "updated_at": datetime.now(timezone.utc).isoformat()}, "$inc": {"revision": 1}})
    if not result.matched_count:
        raise HTTPException(409, CONFLICT)
    return clean(await db.documents.find_one({"id": str(document_id)}))


@router.get("/documents/{document_id}/file")
async def download_document(document_id: UUID):
    doc = await db.documents.find_one({"id": str(document_id)})
    if not doc or not doc.get("file_data"):
        raise HTTPException(404, "No file is attached")
    return Response(bytes(doc["file_data"]), media_type=doc["content_type"], headers={
        "Content-Disposition": f'attachment; filename="{doc["filename"]}"', "Cache-Control": "private, no-store"})


@router.delete("/documents/{document_id}", status_code=204)
async def delete_document(document_id: UUID, revision: int = Query(ge=1)):
    result = await db.documents.delete_one({"id": str(document_id), "revision": revision})
    if not result.deleted_count:
        raise HTTPException(409, CONFLICT)
    return Response(status_code=204)


@router.get("/activity", dependencies=[Depends(require_owner)])
async def activity(page: int = Query(1, ge=1), q: str = Query("", max_length=100)):
    import re
    query = {"$or": [{f: {"$regex": re.escape(q.strip()), "$options": "i"}} for f in ("actor", "path", "action", "subject")]} if q.strip() else {}
    return {"items": await db.audit_events.find(query, {"_id": 0}).sort("at", -1).skip((page - 1) * 50).limit(50).to_list(50),
            "total": await db.audit_events.count_documents(query), "page": page}


@router.get("/profitability")
async def profitability(month: str = Query(pattern=MONTH_PATTERN)):
    companies = await db.clients.find({}, {"id": 1, "name": 1, "archived": 1}).to_list(None)
    rows = {c["id"]: {"company_id": c["id"], "company_name": c["name"], "archived": c.get("archived", False),
            "revenue": Decimal("0"), "payroll_cost": Decimal("0"), "operating_expenses": Decimal("0"), "salary_cash_expenses": Decimal("0"), "payroll_registers": 0, "invoice_count": 0} for c in companies}
    def row_for(cid, name):
        return rows.setdefault(cid or "unassigned", {"company_id": cid, "company_name": name if cid else "Unassigned company", "archived": False,
            "revenue": Decimal("0"), "payroll_cost": Decimal("0"), "operating_expenses": Decimal("0"), "salary_cash_expenses": Decimal("0"), "payroll_registers": 0, "invoice_count": 0})
    unassigned_month = Decimal("0")
    async for inv in db.invoices.find({}, {"company_id": 1, "client_name": 1, "totals": 1, "service_month": 1, "billing_period": 1}):
        attributed = service_month(inv)
        if attributed is None:
            unassigned_month += amount(inv["totals"]["subtotal"])
        elif attributed == month:
            r = row_for(inv.get("company_id"), inv.get("client_name", "Company"))
            r["revenue"] += amount(inv["totals"]["subtotal"])
            r["invoice_count"] += 1
    async for p in db.payroll.find({"month": month}, {"company_id": 1, "company_name": 1, "totals": 1, "cost_responsibility": 1}):
        r = row_for(p["company_id"], p["company_name"])
        r["payroll_registers"] += 1
        if p.get("cost_responsibility", "Agency") == "Agency":
            r["payroll_cost"] += amount(p["totals"]["gross_wages"])
    async for e in db.expenses.find({"month": month}, {"company_id": 1, "company_name": 1, "amount_paise": 1, "cost_type": 1}):
        r = row_for(e.get("company_id"), e.get("company_name", "Company"))
        r["salary_cash_expenses" if e.get("cost_type") == "Payroll" else "operating_expenses"] += Decimal(e["amount_paise"]) / 100
    data = []
    for r in rows.values():
        r["profit"] = r["revenue"] - r["payroll_cost"] - r["operating_expenses"]
        if r["invoice_count"] or r["payroll_registers"] or r["operating_expenses"] or r["salary_cash_expenses"]:
            data.append({k: money(v) if isinstance(v, Decimal) else v for k, v in r.items()})
    return {"month": month, "items": sorted(data, key=lambda r: r["company_name"].casefold()), "unassigned_month_revenue": money(unassigned_month)}


@router.get("/overview")
async def overview():
    day = today()
    month = day[:7]
    assignments = [a for a in await db.assignments.find({}, {"_id": 0}).to_list(None) if a.get("status", "Active") == "Active" and active_on(a, day)]
    sheets = await db.attendance.find({"attendance_date": day}, {"_id": 0}).to_list(None)
    approved = [s for s in sheets if s["status"] == "Approved"]
    assignment_ids = {a["id"] for a in assignments}
    marked = [r for s in approved for r in s["rows"] if r["assignment_id"] in assignment_ids]
    invoices = await db.invoices.find({}, {"id": 1, "client_name": 1, "invoice_number": 1, "totals": 1, "payments": 1, "opening_paid_amount": 1, "payment_status": 1, "due_date": 1, "follow_up_date": 1}).to_list(None)
    payrolls = await db.payroll.find({"month": month, "cost_responsibility": {"$ne": "Client"}}, {"_id": 0}).to_list(None)
    receipts = sum((amount(p["amount"]) for i in invoices for p in i.get("payments", []) if not p.get("voided_at") and p["payment_date"].startswith(month)), Decimal("0"))
    balances = [(i, max(Decimal("0"), amount(i["totals"]["total"]) - received(i))) for i in invoices]
    reqs = [r for r in await requirements() if r["status"] == "Open" and not r["company_archived"]]
    reminders = []
    active_company_ids = {c["id"] for c in await db.clients.find({"archived": {"$ne": True}}, {"id": 1}).to_list(None)}
    for collection, label, title_field, link in (("staffing_requirements", "Staffing", "role", "requirements"), ("recruitment", "Recruitment", "worker_name", "recruitment"), ("documents", "Document", "title", "documents")):
        async for d in db[collection].find({"follow_up_date": {"$ne": None}}, {"file_data": 0}):
            if collection in {"staffing_requirements", "recruitment"} and d.get("company_id") and d["company_id"] not in active_company_ids:
                continue
            due = d.get("follow_up_date")
            if due and due <= day and d.get("status") not in {"Closed", "Not required"} and d.get("stage") not in {"Joined", "Rejected", "Withdrawn"}:
                reminders.append({"id": d["id"], "kind": label, "title": d[title_field], "date": due, "tab": link})
    for inv, balance in balances:
        due = inv.get("follow_up_date") or inv.get("due_date")
        if balance > 0 and due and due <= day:
            reminders.append({"id": inv["id"], "kind": "Client payment", "title": f'{inv["client_name"]} · {inv["invoice_number"]} · {money(balance)} INR', "date": due, "tab": "invoices"})
    async for rec in db.recruitment.find({"stage": {"$in": ["Interview", "Joining Scheduled"]}}, {"_id": 0}):
        if rec.get("company_id") and rec["company_id"] not in active_company_ids:
            continue
        scheduled = rec.get("interview_date") if rec["stage"] == "Interview" else rec.get("joining_date")
        if scheduled and scheduled <= day and not (rec.get("follow_up_date") and rec["follow_up_date"] <= day):
            reminders.append({"id": rec["id"] + "-scheduled", "kind": rec["stage"], "title": rec["worker_name"] + " · " + (rec.get("company_name") or rec.get("job_title") or rec.get("shortlist_name") or "Recruitment"), "date": scheduled, "tab": "recruitment"})
    cutoff = (date.fromisoformat(day) + timedelta(days=30)).isoformat()
    expiring = await db.documents.find({"expiry_date": {"$ne": None}, "status": {"$ne": "Not required"}}, {"file_data": 0}).to_list(None)
    for doc in expiring:
        if doc.get("expiry_date") and doc["expiry_date"] <= cutoff:
            reminders.append({"id": doc["id"] + "-expiry", "kind": "Document expiry", "title": f'{doc["entity_name"]} · {doc["title"]}', "date": doc["expiry_date"], "tab": "documents"})
    payable = sum((amount(p["totals"]["payable"]) for p in payrolls), Decimal("0"))
    paid = sum((salary_paid(p) for p in payrolls), Decimal("0"))
    return {"date": day, "month": month, "deployed_workers": len({a.get("worker_id") or a["id"] for a in assignments}), "deployments": len(assignments),
            "available_workers": await db.workers.count_documents({"status": "Available"}),
            "absent": sum(r["status"] == "Absent" for r in marked), "leave": sum(r["status"] == "Leave" for r in marked),
            "half_days": sum(r["status"] == "Half-day" for r in marked), "unmarked": len(assignment_ids - {r["assignment_id"] for r in marked}),
            "draft_sheets": sum(s["status"] == "Draft" for s in sheets), "shortages": sum(r["shortage"] for r in reqs),
            "receipts_month": money(receipts), "outstanding": money(sum((b for _, b in balances), Decimal("0"))),
            "overdue": money(sum((b for i, b in balances if i.get("due_date") and i["due_date"] < day), Decimal("0"))),
            "salary_payable": money(payable), "salary_paid": money(paid), "salary_balance": money(max(Decimal("0"), payable - paid)),
            "missing_documents": await db.documents.count_documents({"status": "Missing"}),
            "expiring_documents": sum(bool(d.get("expiry_date")) and d["expiry_date"] <= cutoff for d in expiring),
            "reminders": sorted(reminders, key=lambda r: r["date"]), "requirements": reqs}

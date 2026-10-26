"""Private monthly payroll registers, based on Company Workforce assignments."""

import hashlib
import json
import re
from datetime import datetime, timezone
from uuid import NAMESPACE_URL, uuid5

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import AwareDatetime
from pymongo.errors import DuplicateKeyError
from starlette.concurrency import run_in_threadpool

from lib.auth import require_admin
from lib.db import db
from lib.invoices import InvoiceProfile
from lib.months import MONTH_PATTERN
from lib.ledger import salary_paid, amount
from lib.payroll import MAX_EMPLOYEES, Payroll, PayrollEmployee, PayrollInput, PayrollLine, PayrollSave, calculate_payroll

router = APIRouter(prefix="/admin/payroll", dependencies=[Depends(require_admin)])
CONFLICT = "Payroll changed in another session. Reopen this company and month before saving."


def register_id(company_id: str, month: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"bws:payroll:{company_id}:{month}"))


def record_model(doc: dict) -> Payroll:
    return Payroll(**{key: value for key, value in doc.items() if key in Payroll.model_fields})


def employee_model(doc: dict) -> PayrollEmployee:
    return PayrollEmployee(
        assignment_id=doc["id"], employee_id=doc.get("employee_id"), full_name=doc["full_name"],
        role=(doc.get("role") or "")[:150] or None, salary=doc.get("salary"),
        salary_basis=doc.get("salary_basis", "Monthly"), status=doc.get("status", "Active"),
    )


async def find_payroll(run_id: str) -> Payroll:
    doc = await db.payroll.find_one({"_id": run_id})
    if not doc:
        raise HTTPException(404, "Payroll not found")
    return record_model(doc)


@router.get("/companies")
async def payroll_companies():
    companies = await db.clients.find({"archived": {"$ne": True}}, {"_id": 0, "id": 1, "name": 1}).sort("name", 1).to_list(2000)
    by_id = {company["id"]: {"id": company["id"], "name": company["name"], "saved_only": False} for company in companies}
    # Retain access to saved registers after a company is removed from the roster.
    history = await db.payroll.find({}, {"company_id": 1, "company_name": 1}).sort("updated_at", -1).to_list(None)
    for record in history:
        by_id.setdefault(record["company_id"], {"id": record["company_id"], "name": record["company_name"], "saved_only": True})
    return sorted(by_id.values(), key=lambda company: company["name"].casefold())


@router.get("/draft")
async def payroll_draft(company_id: str = Query(min_length=1, max_length=80), month: str = Query(pattern=MONTH_PATTERN)):
    doc = await db.payroll.find_one({"_id": register_id(company_id, month)})
    saved = record_model(doc) if doc else None
    company = await db.clients.find_one({"id": company_id, "archived": {"$ne": True}})
    if not company and not saved:
        raise HTTPException(404, "Company not found. Add it in Company Workforce first.")
    employees = await db.assignments.find({"client_id": company_id, "company_archived": {"$ne": True}}, {"_id": 0}).sort("full_name", 1).to_list(MAX_EMPLOYEES + 1)
    if len(employees) > MAX_EMPLOYEES:
        raise HTTPException(422, f"Payroll supports up to {MAX_EMPLOYEES} employees per company and month")
    people = {row["id"]: employee_model(row) for row in employees}
    if saved:
        for line in saved.lines:
            people.setdefault(line.assignment_id, PayrollEmployee(**line.model_dump(include=set(PayrollEmployee.model_fields))))
    return {
        "company": {"id": company_id, "name": company["name"] if company else saved.company_name},
        "employees": sorted(people.values(), key=lambda person: person.full_name.casefold()), "payroll": saved,
    }


@router.post("/preview")
async def payroll_preview(payload: PayrollInput):
    lines, totals = calculate_payroll(payload)
    return {"lines": lines, "totals": totals}


@router.get("")
async def list_payroll(company_id: str | None = Query(default=None, max_length=80), page: int = Query(default=1, ge=1)):
    query = {"company_id": company_id} if company_id else {}
    total = await db.payroll.count_documents(query)
    projection = {"_id": 0, "id": 1, "company_id": 1, "company_name": 1, "month": 1, "revision": 1, "updated_at": 1, "totals": 1}
    records = await db.payroll.find(query, projection).sort("month", -1).skip((page - 1) * 20).limit(20).to_list(20)
    return {"items": records, "total": total, "page": page, "page_size": 20}


@router.post("", response_model=Payroll)
async def save_payroll(payload: PayrollSave):
    if not payload.lines or not any(line.worked_days > 0 for line in payload.lines):
        raise HTTPException(422, "Select employees and enter worked days for at least one employee")
    if any(line.worked_days > 0 and line.daily_rate == 0 for line in payload.lines):
        raise HTTPException(422, "Enter a daily rate for every employee with worked days")
    if any(line.overtime_hours > 0 and line.overtime_rate == 0 for line in payload.lines):
        raise HTTPException(422, "Enter an hourly overtime rate for every employee with overtime")
    if payload.attendance_refs:
        from routers.operations import attendance_totals
        summary = await attendance_totals(payload.company_id, payload.month)
        if payload.attendance_refs != {s["id"]: s["revision"] for s in summary["sheets"]}:
            raise HTTPException(409, "Payroll-ready attendance changed. Import it again before saving payroll.")
        by_id = {r["assignment_id"]: r for r in summary["lines"]}
        for line in payload.lines:
            imported = by_id.get(line.assignment_id)
            if imported and (line.worked_days != amount(imported["worked_days"]) or line.overtime_hours != amount(imported["overtime_hours"])):
                raise HTTPException(422, "Attendance-linked payroll must match payroll-ready days and overtime. Re-import attendance or choose manual attendance.")
    run_id = register_id(payload.company_id, payload.month)
    existing = await db.payroll.find_one({"_id": run_id})
    data = payload.model_dump(mode="json", exclude={"revision", "created_at"})
    data["lines"] = sorted(data["lines"], key=lambda line: line["assignment_id"])
    fingerprint = hashlib.sha256(json.dumps(data, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    if existing and existing.get("input_hash") == fingerprint and (payload.revision in {existing["revision"], existing["revision"] - 1} or (existing["revision"] == 1 and payload.revision is None)):
        return record_model(existing)
    if (existing and payload.revision != existing["revision"]) or (not existing and payload.revision is not None):
        raise HTTPException(409, CONFLICT)
    old = record_model(existing) if existing else None
    # A deleted month may later be recreated with the same deterministic ID.
    # Match its creation as well as its revision so an old editor cannot change
    # a replacement register, including a replacement created during this save.
    if (old and payload.created_at != old.created_at) or (not old and payload.created_at is not None):
        raise HTTPException(409, CONFLICT)
    company = await db.clients.find_one({"id": payload.company_id, "archived": {"$ne": True}})
    if not company and not old:
        raise HTTPException(404, "Company not found. Add it in Company Workforce first.")
    ids = [line.assignment_id for line in payload.lines]
    assignments = await db.assignments.find({"client_id": payload.company_id, "company_archived": {"$ne": True}, "id": {"$in": ids}}, {"_id": 0}).to_list(MAX_EMPLOYEES)
    people = {row["id"]: employee_model(row) for row in assignments}
    if old:
        # Saved employee details remain a historical snapshot, even after edits
        # or removal in Company Workforce.
        people.update({line.assignment_id: PayrollEmployee(**line.model_dump(include=set(PayrollEmployee.model_fields))) for line in old.lines})
    if any(assignment_id not in people for assignment_id in ids):
        raise HTTPException(422, "An employee is not in this company's workforce. Reload payroll and try again.")
    calculated, totals = calculate_payroll(payload)
    amounts = {row.assignment_id: row.model_dump(exclude={"assignment_id"}) for row in calculated}
    lines = [PayrollLine(**people[line.assignment_id].model_dump(), **line.model_dump(exclude={"assignment_id"}), **amounts[line.assignment_id]) for line in payload.lines]
    if old:
        payable_by_id = {line.assignment_id: line.payable for line in lines}
        for paid_line in old.lines:
            paid = salary_paid(existing, paid_line.assignment_id)
            if paid > payable_by_id.get(paid_line.assignment_id, 0):
                raise HTTPException(422, "This edit removes or reduces salary below payments already recorded. Void incorrect payments first.")
        if salary_paid(existing) > 0 and payload.cost_responsibility != old.cost_responsibility:
            raise HTTPException(422, "Void recorded salary payments before changing who pays salaries")
        supplier = old.supplier
    else:
        settings = await db.settings.find_one({"id": "invoice_profile"})
        supplier = InvoiceProfile(**(settings or {}).get("profile", {}))
    now = datetime.now(timezone.utc)
    payroll = Payroll(
        id=run_id, company_id=payload.company_id, company_name=old.company_name if old else company["name"],
        company_location=old.company_location if old else (company.get("location") or ""),
        month=payload.month, supplier=supplier, lines=lines, notes=payload.notes, totals=totals,
        attendance_refs=payload.attendance_refs, cost_responsibility=payload.cost_responsibility, salary_payments=old.salary_payments if old else [],
        revision=old.revision + 1 if old else 1, created_at=old.created_at if old else now, updated_at=now,
    )
    record = {**payroll.model_dump(mode="json"), "input_hash": fingerprint}
    if old:
        result = await db.payroll.update_one({"_id": run_id, "revision": payload.revision, "created_at": existing["created_at"]}, {"$set": record})
        if result.matched_count == 0:
            raise HTTPException(409, CONFLICT)
    else:
        try:
            await db.payroll.insert_one({"_id": run_id, **record})
        except DuplicateKeyError:
            raced = await db.payroll.find_one({"_id": run_id})
            if raced and raced.get("input_hash") == fingerprint:
                return record_model(raced)
            raise HTTPException(409, CONFLICT)
    return payroll


@router.get("/{run_id}", response_model=Payroll)
async def get_payroll(run_id: str):
    return await find_payroll(run_id)


@router.delete("/{run_id}", status_code=204)
async def delete_payroll(run_id: str, revision: int = Query(ge=1), updated_at: AwareDatetime = Query()):
    doc = await db.payroll.find_one({"_id": run_id})
    if not doc:
        raise HTTPException(404, "Payroll not found")
    saved = record_model(doc)
    if doc.get("salary_payments"):
        raise HTTPException(409, "Payroll with a salary payment history must be kept. Correct entries in the Salary Payments register.")
    conflict = "This payroll changed in another session. Refresh saved payroll before deleting it."
    if saved.revision != revision or saved.updated_at != updated_at:
        raise HTTPException(409, conflict)
    result = await db.payroll.delete_one({"_id": run_id, "revision": revision, "updated_at": doc["updated_at"]})
    if result.deleted_count == 0:
        raise HTTPException(409, conflict)
    return Response(status_code=204)


@router.get("/{run_id}/download/{format}")
async def download_payroll(run_id: str, format: str):
    if format not in ("pdf", "xlsx"):
        raise HTTPException(404, "Choose PDF or Excel")
    from lib.payroll_exports import export_payroll_pdf, export_payroll_xlsx

    payroll = await find_payroll(run_id)
    content = await run_in_threadpool(export_payroll_pdf if format == "pdf" else export_payroll_xlsx, payroll)
    company = re.sub(r"[^A-Za-z0-9]+", "-", payroll.company_name).strip("-")[:50] or "Company"
    filename = f"BWS-Payroll-{company}-{payroll.month}.{format}"
    media = "application/pdf" if format == "pdf" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return Response(content, media_type=media, headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "private, no-store"})

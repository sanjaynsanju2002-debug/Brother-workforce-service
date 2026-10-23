"""Client receipts and employee disbursements, with atomic revision checks."""
from datetime import date, datetime, timezone
from decimal import Decimal
from io import BytesIO
from typing import Literal
from uuid import UUID
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field, ConfigDict
from starlette.concurrency import run_in_threadpool

from lib.auth import require_admin
from lib.db import db
from lib.ledger import PaymentInput, amount, money, payment_record, payment_state, received, salary_paid
from lib.months import MONTH_PATTERN
from lib.invoices import Invoice
from lib.payroll import Payroll

router = APIRouter(prefix="/admin/operations", dependencies=[Depends(require_admin)])
CONFLICT = "This record changed in another session. Reload before recording the payment."


class VoidInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    revision: int = Field(ge=1)
    reason: str = Field(min_length=3, max_length=300)


class FollowUpInput(BaseModel):
    revision: int = Field(ge=1)
    follow_up_date: date | None = None


class SalaryPaymentInput(PaymentInput):
    assignment_id: str = Field(min_length=1, max_length=80)
    kind: Literal["Salary", "Advance"] = "Salary"


async def record(collection, record_id):
    doc = await db[collection].find_one({"id": record_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Saved invoice or payroll not found")
    model = Invoice if collection == "invoices" else Payroll
    return model.model_validate({k: v for k, v in doc.items() if k in model.model_fields}).model_dump(mode="json")


async def update(collection, doc, revision, values):
    result = await db[collection].update_one({"id": doc["id"], "revision": revision}, {"$set": {
        **values, "revision": revision + 1, "updated_at": datetime.now(timezone.utc).isoformat()}})
    if not result.matched_count:
        raise HTTPException(409, CONFLICT)
    return await record(collection, doc["id"])


def replay(doc, field, payload):
    prior = next((p for p in doc.get(field, []) if p["id"] == payload.request_id), None)
    if prior:
        values = payload.model_dump(mode="json", exclude={"request_id", "revision"})
        if any((amount(prior.get(k)) != amount(v)) if k == "amount" else prior.get(k) != v for k, v in values.items()):
            raise HTTPException(409, "This payment request was already used with different details. Reload the register.")
        return True
    return False


@router.post("/invoices/{invoice_id}/payments")
async def add_receipt(invoice_id: str, payload: PaymentInput, request: Request):
    doc = await record("invoices", invoice_id)
    if replay(doc, "payments", payload):
        return doc
    if len(doc.get("payments", [])) >= 5000:
        raise HTTPException(422, "This invoice has reached the payment entry limit")
    paid = received(doc)
    if paid + payload.amount > amount(doc["totals"]["total"]):
        raise HTTPException(422, "Payment exceeds the remaining invoice balance")
    opening = doc.get("opening_paid_amount")
    if opening is None:
        opening = money(paid)
    return await update("invoices", doc, payload.revision, {
        "payments": [*doc.get("payments", []), payment_record(payload, request.state.admin["name"])],
        "opening_paid_amount": opening, "payment_status": payment_state(doc["totals"]["total"], paid + payload.amount)})


@router.post("/invoices/{invoice_id}/payments/{payment_id}/void")
async def void_receipt(invoice_id: str, payment_id: str, payload: VoidInput, request: Request):
    doc = await record("invoices", invoice_id)
    payments = doc.get("payments", [])
    p = next((p for p in payments if p["id"] == payment_id), None)
    if not p:
        raise HTTPException(404, "Payment not found")
    if p.get("voided_at"):
        return doc
    paid = received(doc) - amount(p["amount"])
    opening = doc.get("opening_paid_amount") or "0.00"
    p.update(voided_at=datetime.now(timezone.utc).isoformat(), voided_by=request.state.admin["name"], void_reason=payload.reason.strip())
    return await update("invoices", doc, payload.revision, {"payments": payments, "opening_paid_amount": opening,
        "payment_status": payment_state(doc["totals"]["total"], paid)})


@router.put("/invoices/{invoice_id}/follow-up")
async def receipt_follow_up(invoice_id: str, payload: FollowUpInput):
    doc = await record("invoices", invoice_id)
    return await update("invoices", doc, payload.revision, {"follow_up_date": payload.follow_up_date.isoformat() if payload.follow_up_date else None})


@router.get("/salary-register")
async def salary_register(month: str = Query(pattern=MONTH_PATTERN), company_id: str | None = None):
    query = {"month": month}
    if company_id:
        query["company_id"] = company_id
    docs = await db.payroll.find(query, {"_id": 0}).sort("company_name", 1).to_list(None)
    rows = []
    for p in docs:
        for line in p["lines"]:
            payments = [entry for entry in p.get("salary_payments", []) if entry["assignment_id"] == line["assignment_id"]]
            paid = salary_paid(p, line["assignment_id"])
            advances = sum((amount(t["amount"]) for t in payments if t["kind"] == "Advance" and not t.get("voided_at")), Decimal("0"))
            rows.append({"payroll_id": p["id"], "revision": p["revision"], "company_id": p["company_id"], "company_name": p["company_name"],
                "month": month, "assignment_id": line["assignment_id"], "full_name": line["full_name"], "employee_id": line.get("employee_id"),
                "payable": line["payable"], "paid": money(paid), "advances": money(advances), "balance": money(amount(line["payable"]) - paid),
                "cost_responsibility": p.get("cost_responsibility", "Agency"), "payments": payments})
    return {"month": month, "items": rows}


@router.post("/payroll/{payroll_id}/payments")
async def add_salary_payment(payroll_id: str, payload: SalaryPaymentInput, request: Request):
    doc = await record("payroll", payroll_id)
    if replay(doc, "salary_payments", payload):
        return doc
    if doc.get("cost_responsibility", "Agency") != "Agency":
        raise HTTPException(422, "This register is marked Client pays salaries. Record only agency disbursements here.")
    line = next((r for r in doc["lines"] if r["assignment_id"] == payload.assignment_id), None)
    if not line:
        raise HTTPException(404, "Employee not found in the saved payroll")
    if salary_paid(doc, payload.assignment_id) + payload.amount > amount(line["payable"]):
        raise HTTPException(422, "Payment exceeds this employee's remaining salary balance")
    if len(doc.get("salary_payments", [])) >= 10000:
        raise HTTPException(422, "This payroll has reached the payment entry limit")
    return await update("payroll", doc, payload.revision, {
        "salary_payments": [*doc.get("salary_payments", []), payment_record(payload, request.state.admin["name"])]})


@router.post("/payroll/{payroll_id}/payments/{payment_id}/void")
async def void_salary_payment(payroll_id: str, payment_id: str, payload: VoidInput, request: Request):
    doc = await record("payroll", payroll_id)
    payments = doc.get("salary_payments", [])
    p = next((p for p in payments if p["id"] == payment_id), None)
    if not p:
        raise HTTPException(404, "Salary payment not found")
    if p.get("voided_at"):
        return doc
    p.update(voided_at=datetime.now(timezone.utc).isoformat(), voided_by=request.state.admin["name"], void_reason=payload.reason.strip())
    return await update("payroll", doc, payload.revision, {"salary_payments": payments})


def pdf_document(title, lines, supplier_name="Brothers Workforce Solutions"):
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.pagesizes import A4
    buf = BytesIO()
    styles = getSampleStyleSheet()
    styles["Title"].textColor = colors.HexColor("#0F2444")
    blocks = [Paragraph(escape(supplier_name), styles["Title"]), Paragraph(escape(title), styles["Heading2"]), Spacer(1, 16)]
    for label, value in lines:
        blocks.extend([Paragraph(f'<b>{escape(str(label))}</b>: {escape(str(value))}', styles["Normal"]), Spacer(1, 8)])
    SimpleDocTemplate(buf, pagesize=A4, title=title, author="Brothers Workforce Solutions").build(blocks)
    return buf.getvalue()


@router.get("/invoices/{invoice_id}/payments/{payment_id}/receipt.pdf")
async def download_receipt(invoice_id: str, payment_id: str):
    doc = await record("invoices", invoice_id)
    p = next((p for p in doc.get("payments", []) if p["id"] == payment_id), None)
    if not p:
        raise HTTPException(404, "Payment not found")
    lines = [("Receipt ID", p["id"]), ("Client", doc["client_name"]), ("Invoice", doc["invoice_number"]),
             ("Payment date", p["payment_date"]), ("Amount (INR)", money(p["amount"])), ("Method", p["method"]),
             ("Reference", p.get("reference") or "Not supplied"), ("Recorded by", p["by"]),
             ("Status", "VOID - " + p.get("void_reason", "") if p.get("voided_at") else "Recorded"), ("Notes", p.get("notes") or "—")]
    content = await run_in_threadpool(pdf_document, "Client payment receipt", lines, doc.get("supplier", {}).get("name", "Brothers Workforce Solutions"))
    return Response(content, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="BWS-Receipt-{p["id"]}.pdf"', "Cache-Control": "private, no-store"})


@router.get("/payroll/{payroll_id}/payslip/{assignment_id}.pdf")
async def download_payslip(payroll_id: str, assignment_id: str):
    doc = await record("payroll", payroll_id)
    line = next((r for r in doc["lines"] if r["assignment_id"] == assignment_id), None)
    if not line:
        raise HTTPException(404, "Employee not found in this payroll")
    paid = salary_paid(doc, assignment_id)
    entries = [t for t in doc.get("salary_payments", []) if t["assignment_id"] == assignment_id and not t.get("voided_at")]
    lines = [("Company", doc["company_name"]), ("Payroll month", doc["month"]), ("Employee", line["full_name"]),
             ("Employee ID", line.get("employee_id") or "Not supplied"), ("Role", line.get("role") or "Not supplied"),
             ("Worked days", line["worked_days"]), ("Daily rate (INR)", line["daily_rate"]),
             ("Overtime hours / hourly rate (INR)", f'{line.get("overtime_hours", "0")} / {line.get("overtime_rate", "0")}'),
             ("Gross wages (INR)", line["gross_wages"]), ("ESI deduction (INR)", line["esi_deduction"]),
             ("PF deduction (INR)", line["pf_deduction"]), ("Net payable (INR)", line["payable"]),
             ("Advances paid (INR)", money(sum((amount(t["amount"]) for t in entries if t["kind"] == "Advance"), Decimal("0")))),
             ("Total paid including advances (INR)", money(paid)), ("Balance (INR)", money(amount(line["payable"]) - paid)),
             ("Salary paid by", doc.get("cost_responsibility", "Agency")), ("Register revision", doc["revision"])]
    for entry in entries:
        lines.append((entry["payment_date"] + " · " + entry["kind"], f'INR {entry["amount"]} · {entry["method"]} · {entry.get("reference") or "No reference"}'))
    content = await run_in_threadpool(pdf_document, "Employee payslip", lines, doc.get("supplier", {}).get("name", "Brothers Workforce Solutions"))
    import re
    safe_id = re.sub(r"[^A-Za-z0-9_-]", "", assignment_id)[:80] or "employee"
    return Response(content, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="BWS-Payslip-{doc["month"]}-{safe_id}.pdf"', "Cache-Control": "private, no-store"})

"""Monthly business expenses and private bills, using the existing admin session."""

import hashlib
import json
import re
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from uuid import UUID
from typing import Literal

from bson.binary import Binary
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from pydantic import BaseModel
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from lib.auth import require_admin
from lib.db import db
from lib.months import MONTH_PATTERN
from models.bws import Ok

router = APIRouter(prefix="/admin/expenses", dependencies=[Depends(require_admin)])
MAX_BILL_BYTES = 5 * 1024 * 1024
PAGE_SIZE = 50
MEDIA_TYPES = {".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}


class Expense(BaseModel):
    id: str
    expense_date: str
    description: str
    amount: str
    bill_filename: str | None = None
    company_id: str | None = None
    company_name: str | None = None
    cost_type: Literal["Operating", "Payroll"] = "Operating"
    revision: int
    created_at: datetime


class ExpensePage(BaseModel):
    items: list[Expense]
    month: str
    total_amount: str
    total: int
    page: int
    page_size: int = PAGE_SIZE


def money(paise: int) -> str:
    return f"{Decimal(paise) / 100:.2f}"


def expense_record(doc: dict) -> Expense:
    return Expense(**{**doc, "amount": money(doc["amount_paise"])})


def expense_values(expense_date: str, description: str, amount: str) -> dict:
    try:
        parsed = date.fromisoformat(expense_date)
        if parsed.isoformat() != expense_date:
            raise ValueError
    except ValueError:
        raise HTTPException(422, "Choose a valid expense date")
    description = description.strip()
    if not description or len(description) > 200 or any(ord(c) < 32 for c in description):
        raise HTTPException(422, "Enter an expense description of up to 200 characters")
    amount = amount.strip()
    if not re.fullmatch(r"\d{1,10}(?:\.\d{1,2})?", amount) or Decimal(amount) <= 0:
        raise HTTPException(422, "Enter a positive amount in rupees, with at most two decimal places")
    return {"expense_date": expense_date, "month": expense_date[:7], "description": description,
            "amount_paise": int(Decimal(amount) * 100)}


async def attribution(company_id, cost_type):
    if not company_id:
        return {"company_id": None, "company_name": None, "cost_type": cost_type}
    company = await db.clients.find_one({"id": company_id})
    if not company:
        raise HTTPException(404, "Company not found")
    return {"company_id": company_id, "company_name": company["name"], "cost_type": cost_type}


async def bill_values(file: UploadFile | None) -> dict:
    if file is None:
        return {}
    ext = Path(file.filename or "").suffix.lower()
    if ext not in MEDIA_TYPES:
        raise HTTPException(422, "Bills must be PDF, JPG or PNG files")
    contents = await file.read(MAX_BILL_BYTES + 1)
    if len(contents) > MAX_BILL_BYTES:
        raise HTTPException(413, "Bill must be 5 MB or smaller")
    valid = (ext == ".pdf" and contents.startswith(b"%PDF-")) or (ext == ".png" and contents.startswith(b"\x89PNG\r\n\x1a\n")) or (ext in {".jpg", ".jpeg"} and contents.startswith(b"\xff\xd8\xff"))
    if not valid:
        raise HTTPException(422, "Choose a valid, non-empty PDF, JPG or PNG bill")
    filename = re.sub(r"[^A-Za-z0-9._-]", "_", Path(file.filename or "bill").name)[-150:]
    return {"bill_data": Binary(contents), "bill_filename": filename, "bill_content_type": MEDIA_TYPES[ext]}


@router.get("", response_model=ExpensePage)
async def list_expenses(month: str = Query(pattern=MONTH_PATTERN), page: int = Query(1, ge=1)):
    query = {"month": month}
    summary = await db.expenses.aggregate([
        {"$match": query}, {"$group": {"_id": None, "total": {"$sum": 1}, "amount": {"$sum": "$amount_paise"}}},
    ]).to_list(1)
    summary = summary[0] if summary else {"total": 0, "amount": 0}
    docs = await db.expenses.find(query, {"_id": 0, "bill_data": 0}).sort([
        ("expense_date", -1), ("created_at", -1), ("id", 1),
    ]).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).to_list(PAGE_SIZE)
    return ExpensePage(items=[expense_record(doc) for doc in docs], month=month,
                       total_amount=money(summary["amount"]), total=summary["total"], page=page)


@router.post("", response_model=Expense)
async def create_expense(request: Request, request_id: UUID = Form(), expense_date: str = Form(), description: str = Form(),
                         amount: str = Form(), file: UploadFile | None = File(default=None), company_id: str | None = Form(default=None), cost_type: Literal["Operating", "Payroll"] = Form(default="Operating")):
    values = {**expense_values(expense_date, description, amount), **await attribution(company_id, cost_type)}
    request.state.audit_subject = f"{request_id} · {values['description']} · {expense_date}"
    bill = await bill_values(file)
    digest = hashlib.sha256(json.dumps(values, sort_keys=True).encode() + bytes(bill.get("bill_data", b""))).hexdigest()
    expense_id = str(request_id)
    existing = await db.expenses.find_one({"_id": expense_id}, {"bill_data": 0})
    if existing:
        if existing.get("request_hash") != digest:
            raise HTTPException(409, "This expense was already saved with different details. Refresh the list to edit it.")
        return expense_record(existing)
    now = datetime.now(timezone.utc)
    doc = {"_id": expense_id, "id": expense_id, **values, **bill,
           "revision": 1, "created_at": now, "updated_at": now, "request_hash": digest}
    try:
        # A bounded bill and its expense save atomically, so failed uploads cannot leave half an entry.
        await db.expenses.insert_one(doc)
    except DuplicateKeyError:
        existing = await db.expenses.find_one({"_id": expense_id}, {"bill_data": 0})
        if existing and existing.get("request_hash") == digest:
            return expense_record(existing)
        raise HTTPException(409, "This expense was already saved. Refresh the list before trying again.")
    return expense_record(doc)


@router.put("/{expense_id}", response_model=Expense)
async def update_expense(expense_id: UUID, request: Request, expense_date: str = Form(), description: str = Form(),
                         amount: str = Form(), revision: int = Form(ge=1), file: UploadFile | None = File(default=None), company_id: str | None = Form(default=None), cost_type: Literal["Operating", "Payroll"] = Form(default="Operating")):
    request.state.audit_subject = f"{expense_id} · {description[:200]} · {expense_date}"
    changes = {**expense_values(expense_date, description, amount), **await attribution(company_id, cost_type), **await bill_values(file),
               "updated_at": datetime.now(timezone.utc)}
    doc = await db.expenses.find_one_and_update({"_id": str(expense_id), "revision": revision},
        {"$set": changes, "$inc": {"revision": 1}}, return_document=ReturnDocument.AFTER,
        projection={"_id": 0, "bill_data": 0})
    if not doc:
        raise HTTPException(409, "This expense changed or was removed. Refresh the list before editing it.")
    return expense_record(doc)


@router.get("/{expense_id}/bill")
async def download_bill(expense_id: UUID):
    doc = await db.expenses.find_one({"_id": str(expense_id)}, {"bill_data": 1, "bill_filename": 1, "bill_content_type": 1})
    if not doc or not doc.get("bill_data"):
        raise HTTPException(404, "No bill is attached to this expense")
    return Response(bytes(doc["bill_data"]), media_type=doc["bill_content_type"], headers={
        "Content-Disposition": f'attachment; filename="{doc["bill_filename"]}"',
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    })


@router.delete("/{expense_id}", response_model=Ok)
async def delete_expense(expense_id: UUID, revision: int = Query(ge=1)):
    result = await db.expenses.delete_one({"_id": str(expense_id), "revision": revision})
    if not result.deleted_count:
        raise HTTPException(409, "This expense changed or was removed. Refresh the list before deleting it.")
    return Ok(ok=True)

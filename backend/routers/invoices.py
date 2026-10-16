"""Private invoice records and downloads, using the existing admin session."""

import re
from datetime import datetime, timezone
from typing import Literal
from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import Field
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from starlette.concurrency import run_in_threadpool

from lib.auth import require_admin
from lib.db import db
from lib.invoices import Invoice, InvoiceCompany, InvoiceCompanyInput, InvoiceInput, InvoiceModel, InvoiceProfile, calculate_invoice

router = APIRouter(prefix="/admin/invoices", dependencies=[Depends(require_admin)])


class InvoiceCreate(InvoiceInput):
    request_id: UUID


class InvoiceUpdate(InvoiceInput):
    revision: int = Field(ge=1)


class InvoiceStatusUpdate(InvoiceModel):
    payment_status: Literal["Pending", "Paid"]
    revision: int = Field(ge=1)


def input_data(payload: InvoiceInput) -> dict:
    # Decimal and date become portable strings instead of unsupported BSON values.
    return payload.model_dump(mode="json", exclude={"request_id", "revision"})


def validate_save(payload: InvoiceInput) -> None:
    if not payload.client_name:
        raise HTTPException(422, "Enter the client / company name")
    if not any(line.quantity > 0 and line.rate > 0 for line in payload.lines):
        raise HTTPException(422, "Enter a quantity and rate in at least one charge row")


async def find_company(company_id: UUID) -> InvoiceCompany:
    doc = await db.invoice_companies.find_one({"id": str(company_id)}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Company not found. Add the company before creating an invoice.")
    doc.pop("_id", None)
    return InvoiceCompany(**doc)


@router.get("/companies", response_model=list[InvoiceCompany])
async def list_companies():
    docs = await db.invoice_companies.find({}, {"_id": 0}).sort("name", 1).to_list(None)
    return [InvoiceCompany(**doc) for doc in docs]


@router.post("/companies", response_model=InvoiceCompany)
async def create_company(payload: InvoiceCompanyInput):
    # The primary key prevents duplicate names even before secondary indexes build.
    name_key = " ".join(payload.name.casefold().split())
    company_id = str(uuid5(NAMESPACE_URL, f"bws:invoice-company:{name_key}"))
    company = InvoiceCompany(**payload.model_dump(), id=company_id, created_at=datetime.now(timezone.utc))
    try:
        await db.invoice_companies.insert_one({"_id": company_id, **company.model_dump(mode="json")})
    except DuplicateKeyError:
        raise HTTPException(409, "This company is already saved. Select it from the company list.")
    return company


@router.get("/profile", response_model=InvoiceProfile)
async def get_profile():
    doc = await db.settings.find_one({"id": "invoice_profile"})
    return InvoiceProfile(**(doc or {}).get("profile", {}))


@router.put("/profile", response_model=InvoiceProfile)
async def save_profile(payload: InvoiceProfile):
    await db.settings.update_one(
        {"id": "invoice_profile"}, {"$set": {"profile": payload.model_dump()}}, upsert=True,
    )
    return payload


@router.post("/preview")
async def preview_invoice(payload: InvoiceInput):
    return calculate_invoice(payload)


@router.get("")
async def list_invoices(
    page: int = Query(1, ge=1), q: str = Query("", max_length=150),
    company_id: UUID | None = None, payment_status: Literal["Pending", "Paid"] | None = None,
):
    filters = []
    if company_id:
        company = await find_company(company_id)
        # Include earlier invoices for the same bill-to name without altering their
        # recorded details, GST or totals. They acquire a stable link on next save.
        name_pattern = r"^\s*" + r"\s+".join(re.escape(part) for part in company.name.split()) + r"\s*$"
        filters.append({"$or": [
            {"company_id": str(company_id)},
            {"company_id": None, "client_name": {"$regex": name_pattern, "$options": "i"}},
        ]})
    if q.strip():
        term = {"$regex": re.escape(q.strip()), "$options": "i"}
        filters.append({"$or": [{"client_name": term}, {"invoice_number": term}]})
    if payment_status:
        filters.append({"payment_status": {"$in": [None, "Pending"]} if payment_status == "Pending" else "Paid"})
    query = {"$and": filters} if filters else {}
    total = await db.invoices.count_documents(query)
    docs = await db.invoices.find(query, {"_id": 0}).sort("created_at", -1).skip((page - 1) * 50).limit(50).to_list(50)
    return {"items": [Invoice(**doc) for doc in docs], "total": total, "page": page, "page_size": 50}


@router.post("", response_model=Invoice)
async def create_invoice(payload: InvoiceCreate):
    validate_save(payload)
    if payload.company_id is None:
        raise HTTPException(422, "Select a company before creating an invoice")
    await find_company(payload.company_id)
    invoice_id = str(payload.request_id)
    data = input_data(payload)
    existing = await db.invoices.find_one({"_id": invoice_id})
    if existing:
        if any(existing.get(key) != value for key, value in data.items()):
            raise HTTPException(409, "This request was already saved with different values. Reopen the saved invoice.")
        return Invoice(**{key: value for key, value in existing.items() if key != "_id"})
    year = payload.invoice_date.year - (payload.invoice_date.month < 4)
    period = f"{year % 100:02d}-{(year + 1) % 100:02d}"
    counter = await db.invoice_counters.find_one_and_update(
        {"_id": period}, {"$inc": {"number": 1}}, upsert=True, return_document=ReturnDocument.AFTER,
    )
    now = datetime.now(timezone.utc)
    invoice = Invoice(
        **data, id=invoice_id, invoice_number=f"BWS/{period}/{counter['number']:04d}",
        revision=1, created_at=now, updated_at=now, totals=calculate_invoice(payload),
    )
    try:
        await db.invoices.insert_one({"_id": invoice_id, **invoice.model_dump(mode="json")})
    except DuplicateKeyError:
        existing = await db.invoices.find_one({"_id": invoice_id})
        if not existing or any(existing.get(key) != value for key, value in data.items()):
            raise HTTPException(409, "Invoice could not be saved. Please reload and try again.")
        return Invoice(**{key: value for key, value in existing.items() if key != "_id"})
    return invoice


async def find_invoice(invoice_id: str) -> Invoice:
    doc = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Invoice not found")
    doc.pop("_id", None)
    return Invoice(**doc)


@router.get("/{invoice_id}", response_model=Invoice)
async def get_invoice(invoice_id: str):
    return await find_invoice(invoice_id)


@router.put("/{invoice_id}", response_model=Invoice)
async def update_invoice(invoice_id: str, payload: InvoiceUpdate):
    validate_save(payload)
    old = await find_invoice(invoice_id)
    if payload.company_id is not None:
        await find_company(payload.company_id)
    if old.company_id is not None and payload.company_id != old.company_id:
        raise HTTPException(422, "A saved invoice stays with its company. Create a new invoice for another company.")
    if payload.invoice_date != old.invoice_date:
        raise HTTPException(422, "The date of a numbered invoice is fixed. Create a new invoice to use another date.")
    invoice = Invoice(
        **input_data(payload), id=old.id, invoice_number=old.invoice_number,
        revision=payload.revision + 1, created_at=old.created_at,
        updated_at=datetime.now(timezone.utc), totals=calculate_invoice(payload), payment_status=old.payment_status,
    )
    result = await db.invoices.update_one(
        {"id": invoice_id, "revision": payload.revision}, {"$set": invoice.model_dump(mode="json")},
    )
    if result.matched_count == 0:
        raise HTTPException(409, "This invoice changed in another session. Reopen it before saving.")
    return invoice


@router.patch("/{invoice_id}/status", response_model=Invoice)
async def update_invoice_status(invoice_id: str, payload: InvoiceStatusUpdate):
    old = await find_invoice(invoice_id)
    # Status updates touch only payment metadata, never the saved bill or totals.
    invoice = old.model_copy(update={
        "payment_status": payload.payment_status, "revision": payload.revision + 1,
        "updated_at": datetime.now(timezone.utc),
    })
    changes = invoice.model_dump(mode="json", include={"payment_status", "revision", "updated_at"})
    result = await db.invoices.update_one(
        {"id": invoice_id, "revision": payload.revision}, {"$set": changes},
    )
    if result.matched_count == 0:
        raise HTTPException(409, "This invoice changed in another session. Refresh the saved invoices and try again.")
    return invoice


@router.get("/{invoice_id}/download/{format}")
async def download_invoice(invoice_id: str, format: str):
    if format not in ("pdf", "xlsx"):
        raise HTTPException(404, "Choose PDF or Excel")
    from lib.invoice_exports import export_pdf, export_xlsx

    invoice = await find_invoice(invoice_id)
    content = await run_in_threadpool(export_pdf if format == "pdf" else export_xlsx, invoice)
    filename = invoice.invoice_number.replace("/", "-") + "." + format
    media_type = "application/pdf" if format == "pdf" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return Response(content, media_type=media_type, headers={
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
    })

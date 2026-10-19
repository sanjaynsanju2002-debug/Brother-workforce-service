"""Private invoice records and downloads, using the existing admin session."""

import re
from datetime import datetime, timezone
from typing import Literal
from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import Field
from pymongo.errors import DuplicateKeyError
from starlette.concurrency import run_in_threadpool

from lib.auth import require_admin
from lib.companies import company_name_key, company_name_query, invoice_company
from lib.db import db
from lib.workforce import archive_company, rename_roster_company
from lib.invoices import BillingMode, Invoice, InvoiceCompany, InvoiceCompanyInput, InvoiceInput, InvoiceModel, InvoiceNumber, InvoiceProfile, calculate_invoice
from models.clients import Client

router = APIRouter(prefix="/admin/invoices", dependencies=[Depends(require_admin)])


class InvoiceCreate(InvoiceInput):
    request_id: UUID
    invoice_number: InvoiceNumber


class InvoiceUpdate(InvoiceInput):
    revision: int = Field(ge=1)
    # Preserve the saved number for older clients that do not send this field.
    invoice_number: InvoiceNumber | None = None


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
    if not payload.service_month:
        raise HTTPException(422, "Select the service month this invoice belongs to")


NUMBER_CONFLICT = "This invoice number is already in use. Enter a different invoice number."


async def require_available_number(number: str, invoice_id: str | None = None) -> None:
    existing = await db.invoices.find_one({"invoice_number": number}, {"id": 1})
    if existing and existing.get("id") != invoice_id:
        raise HTTPException(409, NUMBER_CONFLICT)


async def find_company(company_id: UUID) -> InvoiceCompany:
    company_id = str(company_id)
    billing = await db.invoice_companies.find_one({"id": company_id}, {"_id": 0})
    client = await db.clients.find_one({"id": company_id}, {"_id": 0})
    if not client and billing:
        client = await db.clients.find_one(company_name_query(billing["name"]), {"_id": 0})
    if (client and client.get("archived")) or (not client and (not billing or billing.get("archived"))):
        raise HTTPException(404, "Company not found. Add the company before creating an invoice.")
    return invoice_company(client, billing)


@router.get("/companies", response_model=list[InvoiceCompany])
async def list_companies():
    clients = await db.clients.find({"archived": {"$ne": True}}, {"_id": 0}).to_list(None)
    billing = await db.invoice_companies.find({}, {"_id": 0}).to_list(None)
    active_billing = [doc for doc in billing if not doc.get("archived")]
    by_id = {doc["id"]: doc for doc in active_billing}
    by_name = {company_name_key(doc["name"]): doc for doc in active_billing}
    # Keep old invoice company IDs so saved invoices retain their original links.
    companies = {doc["id"]: invoice_company(None, doc) for doc in active_billing}
    for client in clients:
        saved = by_id.get(client["id"]) or by_name.get(company_name_key(client["name"]))
        company = invoice_company(client, saved)
        companies[company.id] = company
    return sorted(companies.values(), key=lambda company: company.name.casefold())


@router.post("/companies", response_model=InvoiceCompany)
async def create_company(payload: InvoiceCompanyInput):
    # The primary key prevents duplicate names even before secondary indexes build.
    name_key = " ".join(payload.name.casefold().split())
    existing = await db.invoice_companies.find_one(company_name_query(payload.name))
    company_id = existing["id"] if existing else str(uuid5(NAMESPACE_URL, f"bws:invoice-company:{name_key}"))
    saved_client = await db.clients.find_one(company_name_query(payload.name))
    if saved_client and saved_client.get("archived"):
        raise HTTPException(409, "This company is archived. Restore it from Archived companies below.")
    if saved_client or (existing and not existing.get("archived")):
        raise HTTPException(409, "This company is already saved. Select it from the company list.")
    company = InvoiceCompany(**payload.model_dump(), id=company_id, created_at=datetime.now(timezone.utc))
    client = Client(id=company_id, name=company.name, billing_address=company.address, gstin=company.gstin, visible=False)
    try:
        await db.clients.insert_one({"_id": company_id, **client.model_dump()})
    except DuplicateKeyError:
        raise HTTPException(409, "This company is already saved. Select it from the company list.")
    try:
        if existing:
            await db.invoice_companies.update_one({"id": company_id}, {"$set": {**company.model_dump(mode="json"), "archived": False}})
        else:
            await db.invoice_companies.insert_one({"_id": company_id, **company.model_dump(mode="json")})
    except Exception:
        await db.clients.delete_one({"id": company_id})
        raise
    return company


async def company_records(company_id: str):
    billing = await db.invoice_companies.find_one({"id": company_id})
    client = await db.clients.find_one({"id": company_id})
    if not client and billing:
        client = await db.clients.find_one(company_name_query(billing["name"]))
    if not client and not billing:
        raise HTTPException(404, "Company not found")
    return client, billing


@router.patch("/companies/{company_id}", response_model=InvoiceCompany)
async def update_company(company_id: UUID, payload: InvoiceCompanyInput):
    client, billing = await company_records(str(company_id))
    if (client or billing).get("archived"):
        raise HTTPException(409, "Restore the company before editing it")
    other = await db.clients.find_one(company_name_query(payload.name))
    other_billing = await db.invoice_companies.find_one(company_name_query(payload.name))
    if (other and (not client or other["id"] != client["id"])) or (other_billing and (not billing or other_billing["id"] != billing["id"])):
        raise HTTPException(409, "Another company already has that name")
    if not client:
        client = Client(id=str(company_id), name=payload.name, visible=False).model_dump()
        await db.clients.insert_one(client)
    changes = {"name": payload.name, "billing_address": payload.address, "gstin": payload.gstin}
    await db.clients.update_one({"id": client["id"]}, {"$set": changes})
    await rename_roster_company(db, client["id"], payload.name)
    if billing:
        await db.invoice_companies.update_one({"id": billing["id"]}, {"$set": payload.model_dump()})
    return invoice_company({**client, **changes}, {**(billing or {}), "id": str(company_id)})


@router.delete("/companies/{company_id}")
async def remove_company(company_id: UUID):
    client, billing = await company_records(str(company_id))
    if client:
        await archive_company(db, client, True)
    else:
        # Materialise a legacy billing-only customer so it can also be restored.
        client = Client(id=str(company_id), name=billing["name"], billing_address=billing.get("address"),
                        gstin=billing.get("gstin"), visible=False).model_dump()
        await db.clients.insert_one(client)
        await archive_company(db, client, True)
    return {"ok": True}


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
    billing_mode: BillingMode | None = None,
):
    filters = []
    if billing_mode:
        filters.append({"billing_mode": {"$in": [None, "managed_services"]} if billing_mode == "managed_services" else "services_only"})
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
    await require_available_number(payload.invoice_number)
    now = datetime.now(timezone.utc)
    invoice = Invoice(
        **data, id=invoice_id,
        revision=1, created_at=now, updated_at=now, totals=calculate_invoice(payload),
    )
    try:
        await db.invoices.insert_one({"_id": invoice_id, **invoice.model_dump(mode="json")})
    except DuplicateKeyError:
        existing = await db.invoices.find_one({"_id": invoice_id})
        if not existing:
            # The unique invoice_number index also protects simultaneous saves.
            raise HTTPException(409, NUMBER_CONFLICT)
        if any(existing.get(key) != value for key, value in data.items()):
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


@router.delete("/{invoice_id}", status_code=204)
async def delete_invoice(invoice_id: str, revision: int = Query(ge=1)):
    await find_invoice(invoice_id)
    # Match the reviewed version atomically.
    result = await db.invoices.delete_one({"id": invoice_id, "revision": revision})
    if result.deleted_count == 0:
        raise HTTPException(409, "This invoice changed in another session. Refresh the saved invoices before deleting it.")
    return Response(status_code=204)


@router.put("/{invoice_id}", response_model=Invoice)
async def update_invoice(invoice_id: str, payload: InvoiceUpdate):
    validate_save(payload)
    old = await find_invoice(invoice_id)
    if payload.company_id is not None and payload.company_id != old.company_id:
        await find_company(payload.company_id)
    if old.company_id is not None and payload.company_id != old.company_id:
        raise HTTPException(422, "A saved invoice stays with its company. Create a new invoice for another company.")
    if payload.invoice_date != old.invoice_date:
        raise HTTPException(422, "The date of a numbered invoice is fixed. Create a new invoice to use another date.")
    number = payload.invoice_number if payload.invoice_number is not None else old.invoice_number
    await require_available_number(number, old.id)
    data = {**input_data(payload), "invoice_number": number}
    invoice = Invoice(
        **data, id=old.id,
        revision=payload.revision + 1, created_at=old.created_at,
        updated_at=datetime.now(timezone.utc), totals=calculate_invoice(payload), payment_status=old.payment_status,
    )
    try:
        result = await db.invoices.update_one(
            {"id": invoice_id, "revision": payload.revision}, {"$set": invoice.model_dump(mode="json")},
        )
    except DuplicateKeyError:
        raise HTTPException(409, NUMBER_CONFLICT)
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

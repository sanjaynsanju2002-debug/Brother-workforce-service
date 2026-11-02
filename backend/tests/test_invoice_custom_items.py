"""Custom invoice descriptions, automatic rates and exact entered row totals."""

import os
from decimal import Decimal
from io import BytesIO

import httpx
import pytest
from openpyxl import load_workbook
from pydantic import ValidationError
from pypdf import PdfReader

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "bws_invoice_test")

from lib import auth
from lib.invoice_exports import export_pdf, export_xlsx
from lib.invoices import InvoiceInput, calculate_invoice, default_lines
from routers import invoices
from server import app
from tests.test_admin_session_and_application import FakeDB
from tests.test_invoices import InvoiceCollection, payload, saved_invoice


def custom_payload(mode="managed_services"):
    return {**payload(), "billing_mode": mode, "lines": [
        {"key": "item_packing", "category": "Packing", "description": "Packing and dispatch support", "quantity": "3", "rate": "33.33", "amount": "100.00"},
    ], "esi_percentage": "3.25", "pf_percentage": "12", "cgst_percentage": "9", "sgst_percentage": "9"}


def draft(data):
    return InvoiceInput(**{key: value for key, value in data.items() if key != "request_id"})


def test_manual_row_total_and_automatic_rate_keep_the_existing_charges_and_taxes():
    data = custom_payload()
    value = draft(data)
    totals = calculate_invoice(value)
    assert totals.line_amounts == {"item_packing": Decimal("100.00")}
    assert (totals.service_charge, totals.esi_amount, totals.pf_amount) == (10, Decimal("3.25"), 12)
    assert totals.subtotal == Decimal("125.25")
    assert totals.cgst_amount == totals.sgst_amount == Decimal("11.27")
    assert totals.total == Decimal("147.79")
    data["lines"][0]["amount"] = None
    calculated = calculate_invoice(draft(data))
    assert calculated.base_amount == Decimal("99.99")
    assert calculated.total == Decimal("147.78")
    data["lines"].append({"key": "item_additional", "category": "Additional work", "description": "Half-day support", "quantity": "0.5", "rate": "200"})
    assert calculate_invoice(draft(data)).base_amount == Decimal("199.99")


def test_services_only_custom_items_still_exclude_wages_esi_and_pf_from_receivables():
    value = draft(custom_payload("services_only"))
    totals = calculate_invoice(value)
    assert value.esi_percentage == value.pf_percentage == 0
    assert totals.base_amount == 100 and totals.subtotal == totals.service_charge == 10
    assert totals.gst_amount == Decimal("1.80") and totals.total == Decimal("11.80")


@pytest.mark.parametrize("change", [
    {"amount": "-1"}, {"amount": "NaN"}, {"amount": "1.001"}, {"quantity": "-1"},
    {"rate": "1.001"}, {"description": "Invalid\x00text"}, {"category": "x" * 151},
    {"description": "x" * 1001}, {"key": "unrecognized"},
])
def test_custom_items_reject_invalid_text_numbers_and_identifiers(change):
    data = custom_payload()
    data["lines"][0].update(change)
    with pytest.raises(ValidationError):
        draft(data)


def test_custom_items_reject_duplicates_mixed_formats_and_excess_rows():
    data = custom_payload()
    for lines in ([data["lines"][0]] * 2, [*data["lines"], default_lines()[0]],
                  [{**data["lines"][0], "key": f"item_{i}"} for i in range(51)]):
        with pytest.raises(ValidationError):
            draft({**data, "lines": lines})


@pytest.mark.parametrize("mode", ["managed_services", "services_only"])
def test_custom_excel_and_pdf_show_five_columns_and_keep_exact_totals(mode):
    data = custom_payload(mode)
    data["lines"].append({"key": "item_dispatch", "category": "Dispatch", "description": '=HYPERLINK("example", "literal description")', "quantity": "2.5", "rate": "200"})
    invoice = saved_invoice(data)
    content = export_xlsx(invoice)
    sheet = load_workbook(BytesIO(content), data_only=False).active
    assert [sheet[cell].value for cell in ("A17", "C17", "D17", "E17", "F17")] == ["Category", "Description", "Quantity", "Rate (INR)", "Amount (INR)"]
    assert sheet["A18"].value == "Packing" and sheet["C18"].value == data["lines"][0]["description"]
    assert sheet["C19"].data_type == "s"  # A manual description cannot become a formula.
    assert sheet["F18"].value == 100
    assert sheet["F19"].value == "=ROUND(D19*E19,2)"
    cached = load_workbook(BytesIO(content), data_only=True).active
    assert cached["F19"].value == 500
    total_row = next(row[0].row for row in cached if row[0].value == "TOTAL (INR)")
    assert Decimal(str(cached[f"F{total_row}"].value)) == invoice.totals.total
    for row in sheet:
        for cell in row:
            assert cell.value not in ("Men", "Women", "Skilled", "Semi-skilled", "Unskilled")
    assert sheet.print_options is not None and len(sheet._images) == 1
    text = " ".join(page.extract_text() for page in PdfReader(BytesIO(export_pdf(invoice))).pages)
    for expected in ("Category", "Description", "Quantity", "Rate (INR)", "Amount (INR)", "Packing and dispatch support", f"{invoice.totals.total:,.2f}"):
        assert expected in text
    assert "Men / Women" not in text and "Skilled" not in text


def test_custom_pdf_paginates_many_items_and_repeats_its_table_header():
    data = custom_payload()
    data["lines"] = [{**data["lines"][0], "key": f"item_{i}", "description": f"Invoice item {i + 1}: " + "Description with wrapping. " * 8} for i in range(50)]
    reader = PdfReader(BytesIO(export_pdf(saved_invoice(data))))
    assert len(reader.pages) > 1
    text = " ".join(page.extract_text() for page in reader.pages)
    assert "Invoice item 50" in text and "TOTAL (INR)" in text
    assert sum("Category" in page.extract_text() for page in reader.pages) > 1


@pytest.mark.asyncio
async def test_custom_items_preview_save_reopen_and_revise_without_changing_other_invoice_fields(monkeypatch):
    fake = FakeDB()
    fake.invoices, fake.invoice_companies, fake.clients = InvoiceCollection(), InvoiceCollection(), InvoiceCollection()
    monkeypatch.setattr(auth, "db", fake)
    monkeypatch.setattr(invoices, "db", fake)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://brothersworkforcesolutions.in") as client:
        await client.post("/api/admin/login", json={"pin": "123456"})
        company = (await client.post("/api/admin/invoices/companies", json={"name": "Invoice test company"})).json()
        data = {**custom_payload(), "company_id": company["id"], "client_name": company["name"]}
        preview_data = {key: value for key, value in data.items() if key != "request_id"}
        for field in ("category", "description", "quantity"):
            invalid = {**data, "lines": [{**data["lines"][0], field: "0" if field == "quantity" else ""}]}
            assert (await client.post("/api/admin/invoices", json=invalid)).status_code == 422
        preview = await client.post("/api/admin/invoices/preview", json=preview_data)
        created = await client.post("/api/admin/invoices", json=data)
        assert created.status_code == 200, created.text
        saved = created.json()
        assert saved["totals"] == preview.json()
        assert saved["totals"]["total"] == "147.79"
        assert (await client.post("/api/admin/invoices", json=data)).json()["id"] == saved["id"]
        reopened = (await client.get(f'/api/admin/invoices/{saved["id"]}')).json()
        assert reopened == saved
        preview_data["lines"][0]["description"] = "Updated manual description"
        revised = await client.put(f'/api/admin/invoices/{saved["id"]}', json={**preview_data, "revision": 1})
        assert revised.status_code == 200, revised.text
        result = revised.json()
        assert result["lines"][0]["description"] == "Updated manual description"
        for field in ("totals", "company_id", "invoice_number", "invoice_date", "due_date", "service_month", "supplier", "notes"):
            assert result[field] == saved[field]
        for extension in ("pdf", "xlsx"):
            downloaded = await client.get(f'/api/admin/invoices/{saved["id"]}/download/{extension}')
            assert downloaded.status_code == 200

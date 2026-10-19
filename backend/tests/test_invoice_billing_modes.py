"""Wage-reference billing must not add wages to service-only receivables or GST."""

from decimal import Decimal
import os
from io import BytesIO
from xml.etree import ElementTree as ET
from zipfile import ZipFile

import httpx
import pytest
from pydantic import ValidationError
from pypdf import PdfReader

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "bws_invoice_test")

from lib import auth
from lib.invoice_exports import export_pdf, export_xlsx
from lib.invoices import Invoice, InvoiceInput, calculate_invoice, default_lines
from routers import invoices
from server import app
from tests.test_admin_session_and_application import FakeDB
from tests.test_invoices import InvoiceCollection, payload, saved_invoice


def services_payload():
    data = payload()
    lines = [line.model_dump(mode="json") for line in default_lines("services_only")]
    lines[0].update(quantity="5", rate="12000")
    lines[1].update(quantity="4", rate="10000")
    return {**data, "billing_mode": "services_only", "lines": lines,
            "service_percentage": "10", "cgst_percentage": "9", "sgst_percentage": "9"}


def test_only_service_charges_are_receivable_and_taxable():
    invoice = saved_invoice(services_payload())
    assert invoice.totals.base_amount == Decimal("100000.00")
    assert invoice.totals.service_charge == invoice.totals.subtotal == Decimal("10000.00")
    assert invoice.totals.cgst_amount == invoice.totals.sgst_amount == Decimal("900.00")
    assert invoice.totals.total == Decimal("11800.00")
    data = {k: v for k, v in services_payload().items() if k != "request_id"}
    for percentage, total in [("8", "9440.00"), ("0", "0.00"), ("100", "118000.00")]:
        assert calculate_invoice(InvoiceInput(**{**data, "service_percentage": percentage})).total == Decimal(total)


def test_each_mode_accepts_exactly_its_own_rows_and_whole_people():
    data = {k: v for k, v in services_payload().items() if k != "request_id"}
    assert len(InvoiceInput(**{k: v for k, v in data.items() if k != "lines"}).lines) == 2
    for update in [
        {"billing_mode": "managed_services"},
        {"billing_mode": "unknown"},
        {"lines": [data["lines"][0], data["lines"][0]]},
        {"lines": [{**data["lines"][0], "quantity": "1.5"}, data["lines"][1]]},
        {"lines": [line.model_dump(mode="json") for line in default_lines()]},
    ]:
        with pytest.raises(ValidationError):
            InvoiceInput(**{**data, **update})
    old = saved_invoice().model_dump(mode="json")
    old.pop("billing_mode")
    legacy = Invoice(**old)
    assert legacy.billing_mode == "managed_services"
    assert calculate_invoice(legacy) == legacy.totals


def test_service_only_excel_formulas_and_pdf_use_two_wage_rows():
    invoice = saved_invoice(services_payload())
    with ZipFile(BytesIO(export_xlsx(invoice))) as archive:
        ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        root = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        cells = {c.get("r"): c for c in root.findall(".//s:c", ns)}
        assert cells["F25"].find("s:f", ns).text == "SUM(F19:F20)"
        assert cells["F26"].find("s:f", ns).text == "ROUND(F25*E26/100,2)"
        assert cells["F29"].find("s:f", ns).text == "F26"
        assert cells["F30"].find("s:f", ns).text == "ROUND($F$29*E30/100,2)"
        for ref, expected in {"F19": 60000, "F20": 40000, "F25": 100000, "F26": 10000, "F29": 10000, "F30": 900, "F31": 900, "F32": 11800}.items():
            assert Decimal(cells[ref].find("s:v", ns).text) == expected
        assert cells["A19"].find("s:is/s:t", ns).text.strip() == "Manpower supply"
        assert cells["A18"].find("s:is/s:t", ns).text.startswith("Services only")
        hidden = {int(row.get("r")) for row in root.findall("s:sheetData/s:row", ns) if row.get("hidden") == "1"}
        assert {21, 22, 23, 24, 27} <= hidden
    pdf = PdfReader(BytesIO(export_pdf(invoice)))
    assert len(pdf.pages) == 1
    text = " ".join(page.extract_text() for page in pdf.pages)
    assert "Services only" in text
    assert "Wage subtotal (reference only)" in text
    assert "11,800.00" in text
    assert "CGST (9%)" in text
    assert "Skilled" not in text and "Overtime" not in text


@pytest.mark.asyncio
async def test_modes_survive_create_retries_updates_and_history_filters(monkeypatch):
    fake = FakeDB()
    fake.invoices = InvoiceCollection()
    fake.invoice_companies = InvoiceCollection()
    fake.clients = InvoiceCollection()
    monkeypatch.setattr(auth, "db", fake)
    monkeypatch.setattr(invoices, "db", fake)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://brothersworkforcesolutions.in") as client:
        assert (await client.post("/api/admin/login", json={"pin": "123456"})).status_code == 200
        company = (await client.post("/api/admin/invoices/companies", json={"name": "Service billing example"})).json()
        data = {**services_payload(), "company_id": company["id"], "client_name": company["name"]}
        draft = {k: v for k, v in data.items() if k != "request_id"}
        preview = await client.post("/api/admin/invoices/preview", json=draft)
        assert preview.status_code == 200, preview.text
        assert preview.json()["total"] == "11800.00"
        created = await client.post("/api/admin/invoices", json=data)
        assert created.status_code == 200, created.text
        record = created.json()
        assert record["billing_mode"] == "services_only"
        assert record["totals"] == preview.json()
        assert (await client.post("/api/admin/invoices", json=data)).json()["id"] == record["id"]
        updated = await client.put(f"/api/admin/invoices/{record['id']}", json={**draft, "revision": 1, "service_percentage": "8"})
        assert updated.status_code == 200, updated.text
        assert updated.json()["totals"]["total"] == "9440.00"
        reopened = (await client.get(f"/api/admin/invoices/{record['id']}")).json()
        assert reopened == updated.json()
        # A historical invoice without a billing-mode field still appears under Managed services.
        old = saved_invoice().model_dump(mode="json")
        old.pop("billing_mode")
        fake.invoices.records.append(old)
        managed = (await client.get("/api/admin/invoices?billing_mode=managed_services")).json()
        services = (await client.get("/api/admin/invoices?billing_mode=services_only")).json()
        assert [row["id"] for row in managed["items"]] == [old["id"]]
        assert [row["id"] for row in services["items"]] == [record["id"]]
        assert (await client.get("/api/admin/invoices?billing_mode=invalid")).status_code == 422

"""Invoice arithmetic, private storage, duplicate retries and both download formats."""

import copy
import os
from datetime import datetime, timezone
from decimal import Decimal
from io import BytesIO
from types import SimpleNamespace
from uuid import uuid4
from xml.etree import ElementTree as ET
from zipfile import ZipFile

import httpx
import pytest
from pydantic import ValidationError
from pypdf import PdfReader

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "bws_invoice_test")

from lib import auth  # noqa: E402
from lib.invoice_exports import export_pdf, export_xlsx  # noqa: E402
from lib.invoices import Invoice, InvoiceInput, calculate_invoice, default_lines  # noqa: E402
from routers import invoices  # noqa: E402
from server import app  # noqa: E402
from tests.test_admin_session_and_application import FakeDB  # noqa: E402


def payload():
    lines = [line.model_dump(mode="json") for line in default_lines()]
    for line in lines:
        if line["key"] == "skilled_men":
            line.update(quantity="10", rate="18000")
        if line["key"] == "skilled_women":
            line.update(quantity="5", rate="18000")
        if line["key"] == "overtime":
            line.update(quantity="1.5", rate="100")
        if line["key"] == "other":
            line.update(quantity="1", rate="850")
    return {
        "request_id": str(uuid4()), "client_name": "Example Manufacturing Pvt Ltd",
        "client_address": "Hebbal Industrial Area\nMysore, Karnataka", "client_gstin": "",
        "invoice_date": "2026-10-16", "due_date": "2026-11-15", "billing_period": "October 2026",
        "lines": lines, "service_percentage": "10", "gst_amount": "0",
        "notes": "Payment within 30 days.",
    }


def saved_invoice(data=None):
    data = data or payload()
    data = {key: value for key, value in data.items() if key != "request_id"}
    model = InvoiceInput(**data)
    return Invoice(**model.model_dump(), id=str(uuid4()), invoice_number="BWS/26-27/0001", revision=1,
                   created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc), totals=calculate_invoice(model))


def test_percentage_includes_overtime_and_other_charges_before_gst():
    invoice = saved_invoice()
    assert invoice.totals.base_amount == Decimal("271000.00")
    assert invoice.totals.service_charge == Decimal("27100.00")
    assert invoice.totals.subtotal == Decimal("298100.00")
    assert invoice.totals.total == Decimal("298100.00")
    data = invoice.model_dump(include=set(InvoiceInput.model_fields))
    data.update(service_percentage="8", gst_amount="123.45")
    totals = calculate_invoice(InvoiceInput(**data))
    assert totals.service_charge == Decimal("21680.00")
    assert totals.total == Decimal("292803.45")


def test_rounding_zero_percentage_and_invalid_inputs():
    data = payload()
    data.pop("request_id")
    data["lines"] = [line.model_dump(mode="json") for line in default_lines()]
    data["lines"][6].update(quantity="0.5", rate="0.01")
    data["service_percentage"] = "0"
    assert calculate_invoice(InvoiceInput(**data)).total == Decimal("0.01")
    for update in ({"service_percentage": "-1"}, {"service_percentage": "101"}, {"gst_amount": "NaN"}, {"gst_amount": "-1"}, {"due_date": "2026-10-01"}, {"client_name": "Invalid\x00name"}):
        with pytest.raises(ValidationError):
            InvoiceInput(**{**data, **update})
    data["lines"][0]["quantity"] = "1.5"
    with pytest.raises(ValidationError):
        InvoiceInput(**data)
    data["lines"][0]["quantity"] = "1"
    data["lines"][0]["key"] = "skilled_women"
    with pytest.raises(ValidationError):
        InvoiceInput(**data)


def test_excel_caches_and_formulas_match_pdf_and_saved_totals():
    invoice = saved_invoice()
    with ZipFile(BytesIO(export_xlsx(invoice))) as archive:
        ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        cells = {cell.get("r"): cell for cell in sheet.findall(".//s:c", ns)}
        for cell, value in {"F19": "180000.00", "F20": "90000.00", "F25": "150.00", "F27": "850.00", "F26": "27100.00", "F29": "298100.00", "F30": "0", "F32": "298100.00"}.items():
            assert Decimal(cells[cell].find("s:v", ns).text) == Decimal(value)
        assert cells["E26"].find("s:v", ns).text == "10"
        assert cells["F26"].find("s:f", ns).text == "ROUND(SUM(F19:F25,F27)*E26/100,2)"
        assert cells["F32"].find("s:f", ns).text == "SUM(F29:F30)"
        assert "xl/media/image.png" in archive.namelist()
        styles = ET.fromstring(archive.read("xl/styles.xml"))
        date_style = styles.find("s:cellXfs", ns)[int(cells["F5"].get("s"))]
        assert styles.find(f"s:numFmts/s:numFmt[@numFmtId='{date_style.get('numFmtId')}']", ns).get("formatCode") == "dd/mm/yyyy"
    pdf = PdfReader(BytesIO(export_pdf(invoice)))
    text = " ".join(page.extract_text() for page in pdf.pages)
    assert "298,100.00" in text
    assert invoice.invoice_number in text
    assert "Example Manufacturing" in text
    assert "Service charge (10%)" in text


def test_excel_client_text_cannot_become_a_formula():
    data = payload()
    data["client_name"] = '=HYPERLINK("https://example.invalid","Click")'
    with ZipFile(BytesIO(export_xlsx(saved_invoice(data)))) as archive:
        root = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        cell = next(cell for cell in root.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c") if cell.get("r") == "A13")
        assert cell.get("t") == "inlineStr"
        assert list(cell)[0].tag.endswith("is")


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, key, direction):
        self.rows.sort(key=lambda row: row[key], reverse=direction == -1)
        return self

    def skip(self, count):
        self.rows = self.rows[count:]
        return self

    def limit(self, count):
        self.rows = self.rows[:count]
        return self

    async def to_list(self, count):
        return self.rows[:count]


class InvoiceCollection:
    def __init__(self):
        self.records = []

    async def find_one(self, query, projection=None):
        return next((copy.deepcopy(row) for row in self.records if all(row.get(k) == v for k, v in query.items())), None)

    async def insert_one(self, data):
        self.records.append(copy.deepcopy(data))

    async def count_documents(self, query):
        return len(self.records)

    def find(self, query, projection=None):
        return Cursor([{key: value for key, value in row.items() if key != "_id"} for row in copy.deepcopy(self.records)])

    async def find_one_and_update(self, query, changes, **kwargs):
        row = next((row for row in self.records if row["_id"] == query["_id"]), None)
        if row is None:
            row = {**query, "number": 0}
            self.records.append(row)
        row["number"] += 1
        return copy.deepcopy(row)

    async def update_one(self, query, changes, **kwargs):
        row = next((row for row in self.records if all(row.get(k) == v for k, v in query.items())), None)
        if row is None:
            return SimpleNamespace(matched_count=0)
        row.update(copy.deepcopy(changes["$set"]))
        return SimpleNamespace(matched_count=1)


@pytest.mark.asyncio
async def test_private_create_retry_update_conflict_and_downloads(monkeypatch):
    fake = FakeDB()
    fake.invoices = InvoiceCollection()
    fake.invoice_counters = InvoiceCollection()
    monkeypatch.setattr(auth, "db", fake)
    monkeypatch.setattr(invoices, "db", fake)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="https://brothersworkforcesolutions.in") as client:
        data = payload()
        assert (await client.get("/api/admin/invoices")).status_code == 401
        assert (await client.post("/api/admin/invoices", json=data)).status_code == 401
        assert (await client.get("/api/admin/invoices/missing/download/pdf")).status_code == 401
        assert (await client.post("/api/admin/login", json={"pin": "123456"})).status_code == 200
        profile = await client.get("/api/admin/invoices/profile")
        assert profile.status_code == 200
        data["supplier"] = profile.json()
        created = await client.post("/api/admin/invoices", json=data)
        assert created.status_code == 200, created.text
        invoice = created.json()
        assert invoice["invoice_number"] == "BWS/26-27/0001"
        assert invoice["totals"]["total"] == "298100.00"
        retry = await client.post("/api/admin/invoices", json=data)
        assert retry.status_code == 200
        assert retry.json()["id"] == invoice["id"]
        assert len(fake.invoices.records) == 1
        assert fake.invoice_counters.records[0]["number"] == 1
        assert (await client.post("/api/admin/invoices", json={**data, "service_percentage": "8"})).status_code == 409
        update = {key: value for key, value in data.items() if key != "request_id"}
        update.update(revision=1, service_percentage="8")
        changed = await client.put(f"/api/admin/invoices/{invoice['id']}", json=update)
        assert changed.status_code == 200, changed.text
        assert changed.json()["revision"] == 2
        assert changed.json()["totals"]["total"] == "292680.00"
        assert (await client.put(f"/api/admin/invoices/{invoice['id']}", json=update)).status_code == 409
        assert (await client.get("/api/admin/invoices")).json()["total"] == 1
        for format, signature in (("pdf", b"%PDF"), ("xlsx", b"PK")):
            result = await client.get(f"/api/admin/invoices/{invoice['id']}/download/{format}")
            assert result.status_code == 200
            assert result.content.startswith(signature)
            assert "private, no-store" in result.headers["cache-control"]
            assert "BWS-26-27-0001" in result.headers["content-disposition"]
        invalid = {**data, "request_id": str(uuid4()), "client_name": " "}
        assert (await client.post("/api/admin/invoices", json=invalid)).status_code == 422

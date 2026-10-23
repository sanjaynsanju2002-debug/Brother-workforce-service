"""Invoice arithmetic, private storage, duplicate retries and both download formats."""

import copy
import os
import re
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
from pymongo.errors import DuplicateKeyError

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
        "request_id": str(uuid4()), "invoice_number": f"INV-{uuid4().hex[:12]}", "client_name": "Example Manufacturing Pvt Ltd",
        "client_address": "Hebbal Industrial Area\nMysore, Karnataka", "client_gstin": "",
        "invoice_date": "2026-10-16", "due_date": "2026-11-15", "service_month": "2026-10", "billing_period": "October 2026",
        "lines": lines, "service_percentage": "10", "cgst_percentage": "0", "sgst_percentage": "0",
        "notes": "Payment within 30 days.",
    }


def saved_invoice(data=None):
    data = data or payload()
    data = {key: value for key, value in data.items() if key != "request_id"}
    model = InvoiceInput(**data)
    return Invoice(**model.model_dump(exclude={"invoice_number"}), id=str(uuid4()), invoice_number="BWS/26-27/0001", revision=1,
                   created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc), totals=calculate_invoice(model))


def test_percentage_includes_overtime_and_other_charges_before_gst():
    invoice = saved_invoice()
    assert invoice.totals.base_amount == Decimal("271000.00")
    assert invoice.totals.service_charge == Decimal("27100.00")
    assert invoice.totals.subtotal == Decimal("298100.00")
    assert invoice.totals.total == Decimal("298100.00")
    data = invoice.model_dump(include=set(InvoiceInput.model_fields))
    data.update(service_percentage="8", cgst_percentage="9", sgst_percentage="9")
    totals = calculate_invoice(InvoiceInput(**data))
    assert totals.service_charge == Decimal("21680.00")
    assert totals.subtotal == Decimal("292680.00")
    assert totals.cgst_amount == Decimal("26341.20")
    assert totals.sgst_amount == Decimal("26341.20")
    assert totals.gst_amount == Decimal("52682.40")
    assert totals.total == Decimal("345362.40")


def test_gst_uses_wages_plus_service_charges_and_recalculates_each_rate():
    data = payload()
    data.pop("request_id")
    data["lines"] = [line.model_dump(mode="json") for line in default_lines()]
    data["lines"][0].update(quantity="10", rate="10000")
    data.update(cgst_percentage="9", sgst_percentage="9", gst_amount="999")
    invoice = InvoiceInput(**data)
    totals = calculate_invoice(invoice)
    assert invoice.gst_amount == 0  # Never add an old manual amount on top of the percentages.
    assert totals.subtotal == Decimal("110000.00")
    assert totals.cgst_amount == totals.sgst_amount == Decimal("9900.00")
    assert totals.total == Decimal("129800.00")
    data.update(service_percentage="8", cgst_percentage="2.5", sgst_percentage="0")
    totals = calculate_invoice(InvoiceInput(**data))
    assert totals.subtotal == Decimal("108000.00")
    assert totals.cgst_amount == Decimal("2700.00")
    assert totals.sgst_amount == Decimal("0.00")
    assert totals.total == Decimal("110700.00")


def test_historical_invoices_keep_recorded_gst_until_percentages_are_entered():
    data = payload()
    data.pop("cgst_percentage")
    data.pop("sgst_percentage")
    data["gst_amount"] = "123.45"
    old = saved_invoice(data).model_dump(mode="json")
    for key in ("cgst_percentage", "sgst_percentage"):
        old.pop(key)
    for key in ("cgst_amount", "sgst_amount"):
        old["totals"].pop(key)
    invoice = Invoice(**old)
    assert not invoice.uses_gst_percentages
    assert calculate_invoice(invoice).total == invoice.totals.total == Decimal("298223.45")
    assert "GST (recorded amount)" in " ".join(page.extract_text() for page in PdfReader(BytesIO(export_pdf(invoice))).pages)
    with ZipFile(BytesIO(export_xlsx(invoice))) as archive:
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        assert sheet.find(".//s:c[@r='F30']/s:v", ns).text == "123.45"
        assert sheet.find(".//s:c[@r='F32']/s:f", ns).text == "SUM(F29:F30)"
    updated = InvoiceInput(**{**invoice.model_dump(include=set(InvoiceInput.model_fields)), "cgst_percentage": "9", "sgst_percentage": "9"})
    assert calculate_invoice(updated).total == Decimal("351758.00")


def test_rounding_zero_percentage_and_invalid_inputs():
    data = payload()
    data.pop("request_id")
    data["lines"] = [line.model_dump(mode="json") for line in default_lines()]
    data["lines"][6].update(quantity="0.5", rate="0.01")
    data["service_percentage"] = "0"
    assert calculate_invoice(InvoiceInput(**data)).total == Decimal("0.01")
    for update in ({"service_percentage": "-1"}, {"service_percentage": "101"}, {"gst_amount": "NaN"}, {"gst_amount": "-1"}, {"cgst_percentage": "-1"}, {"sgst_percentage": "101"}, {"cgst_percentage": "NaN"}, {"sgst_percentage": "9.001"}, {"due_date": "2026-10-01"}, {"client_name": "Invalid\x00name"}):
        with pytest.raises(ValidationError):
            InvoiceInput(**{**data, **update})
    data["lines"][0]["quantity"] = "1.5"
    with pytest.raises(ValidationError):
        InvoiceInput(**data)
    data["lines"][0]["quantity"] = "1"
    data["lines"][0]["key"] = "skilled_women"
    with pytest.raises(ValidationError):
        InvoiceInput(**data)


def test_each_tax_rounds_to_paise_independently():
    data = payload()
    data.pop("request_id")
    data["lines"] = [line.model_dump(mode="json") for line in default_lines()]
    data["lines"][7].update(quantity="1", rate="0.05")
    data.update(service_percentage="0", cgst_percentage="10", sgst_percentage="10")
    totals = calculate_invoice(InvoiceInput(**data))
    assert totals.cgst_amount == totals.sgst_amount == Decimal("0.01")
    assert totals.gst_amount == Decimal("0.02")
    assert totals.total == Decimal("0.07")


def test_excel_caches_and_formulas_match_pdf_and_saved_totals():
    invoice = saved_invoice({**payload(), "cgst_percentage": "9", "sgst_percentage": "9", "supplier": {"payment_details": "Account name: Brothers Workforce Solutions\nBank / account / IFSC: To be provided"}})
    with ZipFile(BytesIO(export_xlsx(invoice))) as archive:
        ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        cells = {cell.get("r"): cell for cell in sheet.findall(".//s:c", ns)}
        for cell, value in {"F19": "180000.00", "F20": "90000.00", "F25": "150.00", "F27": "850.00", "F26": "27100.00", "F29": "298100.00", "E30": "9", "E31": "9", "F30": "26829.00", "F31": "26829.00", "F32": "351758.00"}.items():
            assert Decimal(cells[cell].find("s:v", ns).text) == Decimal(value)
        assert cells["E26"].find("s:v", ns).text == "10"
        assert cells["F26"].find("s:f", ns).text == "ROUND(SUM(F19:F25,F27)*E26/100,2)"
        assert cells["F30"].find("s:f", ns).text == "ROUND($F$29*E30/100,2)"
        assert cells["F31"].find("s:f", ns).text == "ROUND($F$29*E31/100,2)"
        assert cells["F32"].find("s:f", ns).text == "SUM(F29:F31)"
        assert "D30:E30" not in [item.get("ref") for item in sheet.findall("s:mergeCells/s:mergeCell", ns)]
        assert cells["D30"].find("s:is/s:t", ns).text == "CGST (%)"
        assert cells["D31"].find("s:is/s:t", ns).text == "SGST (%)"
        assert "xl/media/image.png" in archive.namelist()
        styles = ET.fromstring(archive.read("xl/styles.xml"))
        date_style = styles.find("s:cellXfs", ns)[int(cells["F5"].get("s"))]
        assert styles.find(f"s:numFmts/s:numFmt[@numFmtId='{date_style.get('numFmtId')}']", ns).get("formatCode") == "dd/mm/yyyy"
    pdf = PdfReader(BytesIO(export_pdf(invoice)))
    assert len(pdf.pages) == 1
    text = " ".join(page.extract_text() for page in pdf.pages)
    assert "298,100.00" in text
    assert "351,758.00" in text
    assert "CGST (9%)" in text
    assert "SGST (9%)" in text
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

    @classmethod
    def matches(cls, row, query):
        for key, value in query.items():
            if key == "$and":
                if not all(cls.matches(row, condition) for condition in value):
                    return False
            elif key == "$or":
                if not any(cls.matches(row, condition) for condition in value):
                    return False
            elif isinstance(value, dict) and "$regex" in value:
                if not re.search(value["$regex"], row.get(key, ""), re.I if value.get("$options") == "i" else 0):
                    return False
            elif isinstance(value, dict) and "$ne" in value:
                if row.get(key) == value["$ne"]:
                    return False
            elif isinstance(value, dict) and "$in" in value:
                if row.get(key) not in value["$in"]:
                    return False
            elif row.get(key) != value:
                return False
        return True

    async def find_one(self, query, projection=None):
        return next((copy.deepcopy(row) for row in self.records if self.matches(row, query)), None)

    async def insert_one(self, data):
        if "_id" in data and any(row.get("_id") == data["_id"] for row in self.records):
            raise DuplicateKeyError("duplicate _id")
        if "invoice_number" in data and any(row.get("invoice_number") == data["invoice_number"] for row in self.records):
            raise DuplicateKeyError("duplicate invoice_number")
        self.records.append(copy.deepcopy(data))

    async def count_documents(self, query):
        return sum(self.matches(row, query) for row in self.records)

    def find(self, query, projection=None):
        return Cursor([{key: value for key, value in row.items() if key != "_id"} for row in copy.deepcopy(self.records) if self.matches(row, query)])

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
        number = changes["$set"].get("invoice_number")
        if number is not None and any(other is not row and other.get("invoice_number") == number for other in self.records):
            raise DuplicateKeyError("duplicate invoice_number")
        row.update(copy.deepcopy(changes["$set"]))
        return SimpleNamespace(matched_count=1)

    async def delete_one(self, query):
        row = next((row for row in self.records if self.matches(row, query)), None)
        if row is None:
            return SimpleNamespace(deleted_count=0)
        self.records.remove(row)
        return SimpleNamespace(deleted_count=1)


@pytest.mark.asyncio
async def test_private_create_retry_update_conflict_and_downloads(monkeypatch):
    fake = FakeDB()
    fake.invoices = InvoiceCollection()
    fake.invoice_counters = InvoiceCollection()
    fake.invoice_companies = InvoiceCollection()
    fake.clients = InvoiceCollection()
    monkeypatch.setattr(auth, "db", fake)
    monkeypatch.setattr(invoices, "db", fake)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="https://brothersworkforcesolutions.in") as client:
        data = {**payload(), "invoice_number": "MYS/26-27/0123"}
        assert (await client.get("/api/admin/invoices")).status_code == 401
        assert (await client.post("/api/admin/invoices", json=data)).status_code == 401
        assert (await client.get("/api/admin/invoices/missing/download/pdf")).status_code == 401
        assert (await client.post("/api/admin/login", json={"pin": "123456"})).status_code == 200
        company = await client.post("/api/admin/invoices/companies", json={"name": data["client_name"], "address": data["client_address"]})
        assert company.status_code == 200
        data["company_id"] = company.json()["id"]
        profile = await client.get("/api/admin/invoices/profile")
        assert profile.status_code == 200
        data["supplier"] = profile.json()
        preview = await client.post("/api/admin/invoices/preview", json={key: value for key, value in {**data, "cgst_percentage": "9", "sgst_percentage": "9"}.items() if key != "request_id"})
        assert preview.status_code == 200
        assert preview.json()["cgst_amount"] == preview.json()["sgst_amount"] == "26829.00"
        assert preview.json()["total"] == "351758.00"
        created = await client.post("/api/admin/invoices", json=data)
        assert created.status_code == 200, created.text
        invoice = created.json()
        assert invoice["invoice_number"] == data["invoice_number"]
        assert invoice["totals"]["total"] == "298100.00"
        assert invoice["payment_status"] == "Pending"
        retry = await client.post("/api/admin/invoices", json=data)
        assert retry.status_code == 200
        assert retry.json()["id"] == invoice["id"]
        assert len(fake.invoices.records) == 1
        assert fake.invoice_counters.records == []
        assert (await client.post("/api/admin/invoices", json={**data, "service_percentage": "8"})).status_code == 409
        update = {key: value for key, value in data.items() if key != "request_id"}
        update.update(revision=1, service_percentage="8", cgst_percentage="9", sgst_percentage="9")
        changed = await client.put(f"/api/admin/invoices/{invoice['id']}", json=update)
        assert changed.status_code == 200, changed.text
        assert changed.json()["revision"] == 2
        assert changed.json()["totals"]["cgst_amount"] == "26341.20"
        assert changed.json()["totals"]["sgst_amount"] == "26341.20"
        assert changed.json()["totals"]["total"] == "345362.40"
        reopened = (await client.get(f"/api/admin/invoices/{invoice['id']}")).json()
        assert reopened["cgst_percentage"] == reopened["sgst_percentage"] == "9"
        assert reopened["totals"] == changed.json()["totals"]
        assert (await client.put(f"/api/admin/invoices/{invoice['id']}", json=update)).status_code == 409
        assert (await client.get("/api/admin/invoices")).json()["total"] == 1
        for format, signature in (("pdf", b"%PDF"), ("xlsx", b"PK")):
            result = await client.get(f"/api/admin/invoices/{invoice['id']}/download/{format}")
            assert result.status_code == 200
            assert result.content.startswith(signature)
            assert "private, no-store" in result.headers["cache-control"]
            assert data["invoice_number"].replace("/", "-") in result.headers["content-disposition"]
        invalid = {**data, "request_id": str(uuid4()), "client_name": " "}
        assert (await client.post("/api/admin/invoices", json=invalid)).status_code == 422


@pytest.mark.asyncio
async def test_companies_are_private_unique_and_invoice_lists_are_isolated(monkeypatch):
    fake = FakeDB()
    fake.invoices = InvoiceCollection()
    fake.invoice_counters = InvoiceCollection()
    fake.invoice_companies = InvoiceCollection()
    fake.clients = InvoiceCollection()
    monkeypatch.setattr(auth, "db", fake)
    monkeypatch.setattr(invoices, "db", fake)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://brothersworkforcesolutions.in") as client:
        assert (await client.get("/api/admin/invoices/companies")).status_code == 401
        assert (await client.post("/api/admin/invoices/companies", json={"name": "Factory A"})).status_code == 401
        await client.post("/api/admin/login", json={"pin": "123456"})
        assert (await client.post("/api/admin/invoices/companies", json={"name": " "})).status_code == 422
        a = (await client.post("/api/admin/invoices/companies", json={"name": "Factory A", "address": "Mysore", "gstin": "29TEST"})).json()
        b = (await client.post("/api/admin/invoices/companies", json={"name": "Factory B"})).json()
        assert a["address"] == "Mysore"
        assert (await client.post("/api/admin/invoices/companies", json={"name": " factory   a "})).status_code == 409
        assert len((await client.get("/api/admin/invoices/companies")).json()) == 2
        assert (await client.post("/api/admin/invoices", json=payload())).status_code == 422
        assert (await client.post("/api/admin/invoices", json={**payload(), "company_id": str(uuid4())})).status_code == 404
        created = []
        for company in (a, b):
            response = await client.post("/api/admin/invoices", json={**payload(), "company_id": company["id"], "client_name": company["name"]})
            assert response.status_code == 200, response.text
            created.append(response.json())
        for company, own in zip((a, b), created):
            result = (await client.get("/api/admin/invoices", params={"company_id": company["id"]})).json()
            assert [item["id"] for item in result["items"]] == [own["id"]]
            assert result["total"] == 1
        assert (await client.get("/api/admin/invoices", params={"company_id": a["id"], "q": "Factory B"})).json()["total"] == 0
        update = {key: value for key, value in created[0].items() if key in invoices.InvoiceUpdate.model_fields}
        update["company_id"] = b["id"]
        assert (await client.put(f"/api/admin/invoices/{created[0]['id']}", json=update)).status_code == 422
        assert (await client.get("/api/admin/invoices", params={"company_id": "invalid"})).status_code == 422


@pytest.mark.asyncio
async def test_status_persists_without_altering_amounts_and_rejects_stale_updates(monkeypatch):
    fake = FakeDB()
    fake.invoices = InvoiceCollection()
    fake.invoice_companies = InvoiceCollection()
    fake.clients = InvoiceCollection()
    monkeypatch.setattr(auth, "db", fake)
    monkeypatch.setattr(invoices, "db", fake)
    original = saved_invoice().model_dump(mode="json")
    # Simulate a real historical document written before companies and statuses.
    for key in ("company_id", "payment_status"):
        original.pop(key)
    await fake.invoices.insert_one(original)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://brothersworkforcesolutions.in") as client:
        path = f"/api/admin/invoices/{original['id']}"
        assert (await client.patch(f"{path}/status", json={"payment_status": "Paid", "revision": 1})).status_code == 401
        await client.post("/api/admin/login", json={"pin": "123456"})
        company = (await client.post("/api/admin/invoices/companies", json={"name": "example   manufacturing Pvt Ltd"})).json()
        result = (await client.get("/api/admin/invoices", params={"company_id": company["id"], "payment_status": "Pending"})).json()
        assert result["total"] == 1
        assert result["items"][0]["payment_status"] == "Pending"
        changed = await client.patch(f"{path}/status", json={"payment_status": "Paid", "revision": 1})
        assert changed.status_code == 200, changed.text
        assert changed.json()["payment_status"] == "Paid"
        assert changed.json()["revision"] == 2
        assert changed.json()["totals"] == original["totals"]
        for key in ("client_name", "lines", "service_percentage", "invoice_number", "created_at"):
            assert changed.json()[key] == original[key]
        assert (await client.get(path)).json()["payment_status"] == "Paid"
        assert (await client.get("/api/admin/invoices", params={"company_id": company["id"], "payment_status": "Pending"})).json()["total"] == 0
        assert (await client.get("/api/admin/invoices", params={"company_id": company["id"], "payment_status": "Paid", "q": "BWS/26-27"})).json()["total"] == 1
        assert (await client.patch(f"{path}/status", json={"payment_status": "Pending", "revision": 1})).status_code == 409
        assert (await client.patch(f"{path}/status", json={"payment_status": "Overdue", "revision": 2})).status_code == 422
        update = {key: value for key, value in changed.json().items() if key in invoices.InvoiceUpdate.model_fields}
        update.update(company_id=company["id"], service_percentage="8")
        assert (await client.put(path, json=update)).status_code == 422  # cannot reduce below the recorded receipt
        pending = await client.patch(f"{path}/status", json={"payment_status": "Pending", "revision": 2})
        assert pending.status_code == 200
        update["revision"] = 3
        edited = await client.put(path, json=update)
        assert edited.status_code == 200, edited.text
        assert edited.json()["payment_status"] == "Pending"
        assert edited.json()["totals"] != original["totals"]


@pytest.mark.asyncio
@pytest.mark.parametrize("payment_status", ["Pending", "Paid"])
async def test_delete_is_private_checks_revision_and_preserves_other_records_and_numbering(monkeypatch, payment_status):
    fake = FakeDB()
    fake.invoices = InvoiceCollection()
    fake.invoice_counters = InvoiceCollection()
    fake.invoice_companies = InvoiceCollection()
    fake.clients = InvoiceCollection()
    monkeypatch.setattr(auth, "db", fake)
    monkeypatch.setattr(invoices, "db", fake)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://brothersworkforcesolutions.in") as client:
        assert (await client.delete("/api/admin/invoices/missing?revision=1")).status_code == 401
        await client.post("/api/admin/login", json={"pin": "123456"})
        companies = []
        created = []
        for name in ("Factory A", "Factory B"):
            company = (await client.post("/api/admin/invoices/companies", json={"name": name})).json()
            companies.append(company)
            created.append((await client.post("/api/admin/invoices", json={**payload(), "company_id": company["id"], "client_name": name})).json())
        target, other = created
        path = f"/api/admin/invoices/{target['id']}"
        if payment_status == "Paid":
            target = (await client.patch(f"{path}/status", json={"payment_status": "Paid", "revision": 1})).json()
        revision = target["revision"]
        assert (await client.delete(path)).status_code == 422
        assert (await client.delete(path, params={"revision": 0})).status_code == 422
        assert (await client.delete(path, params={"revision": revision + 1})).status_code == 409
        assert (await client.delete(path, params={"revision": revision}, headers={"Origin": "https://another.example"})).status_code == 403
        assert len(fake.invoices.records) == 2
        if payment_status == "Paid":
            assert (await client.delete(path, params={"revision": revision})).status_code == 409
            corrected = await client.patch(f"{path}/status", json={"payment_status": "Pending", "revision": revision})
            assert corrected.status_code == 200
            revision = corrected.json()["revision"]
        response = await client.delete(path, params={"revision": revision})
        assert response.status_code == 204
        assert response.content == b""
        assert [row["id"] for row in fake.invoices.records] == [other["id"]]
        assert (await client.get(f"/api/admin/invoices/{other['id']}")).json() == other
        assert (await client.get("/api/admin/invoices", params={"company_id": companies[0]["id"]})).json()["total"] == 0
        assert (await client.get("/api/admin/invoices", params={"company_id": companies[1]["id"]})).json()["total"] == 1
        assert len((await client.get("/api/admin/invoices/companies")).json()) == 2
        for suffix in ("", "/download/pdf", "/download/xlsx"):
            assert (await client.get(f"{path}{suffix}")).status_code == 404
        assert (await client.delete(path, params={"revision": revision})).status_code == 404
        assert (await client.patch(f"{path}/status", json={"payment_status": "Paid", "revision": revision})).status_code == 404
        next_data = {**payload(), "company_id": companies[0]["id"], "client_name": companies[0]["name"], "invoice_number": "OWNER-CHOSEN-003"}
        next_invoice = (await client.post("/api/admin/invoices", json=next_data)).json()
        assert next_invoice["invoice_number"] == next_data["invoice_number"]
        assert fake.invoice_counters.records == []


@pytest.mark.asyncio
async def test_manual_number_required_unique_editable_and_used_in_downloads(monkeypatch):
    fake = FakeDB()
    fake.invoices = InvoiceCollection()
    fake.invoice_companies = InvoiceCollection()
    fake.clients = InvoiceCollection()
    monkeypatch.setattr(auth, "db", fake)
    monkeypatch.setattr(invoices, "db", fake)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://brothersworkforcesolutions.in") as client:
        await client.post("/api/admin/login", json={"pin": "123456"})
        company = (await client.post("/api/admin/invoices/companies", json={"name": "Manual invoice customer"})).json()
        data = {**payload(), "company_id": company["id"], "invoice_number": "MANUAL/001"}
        draft = {key: value for key, value in data.items() if key not in ("request_id", "invoice_number")}
        assert (await client.post("/api/admin/invoices/preview", json=draft)).status_code == 200
        assert (await client.post("/api/admin/invoices", json={**draft, "request_id": data["request_id"]})).status_code == 422
        for number in ("", "   ", "X" * 17, "INV 001", 'INV"001', "INV\n001", "INV.001"):
            assert (await client.post("/api/admin/invoices", json={**data, "invoice_number": number})).status_code == 422
        assert fake.invoices.records == []
        created = (await client.post("/api/admin/invoices", json={**data, "invoice_number": "  MANUAL/001  "})).json()
        assert created["invoice_number"] == "MANUAL/001"
        assert (await client.post("/api/admin/invoices", json=data)).json()["id"] == created["id"]
        assert (await client.post("/api/admin/invoices", json={**data, "request_id": str(uuid4())})).status_code == 409
        second = await client.post("/api/admin/invoices", json={**data, "request_id": str(uuid4()), "invoice_number": "MANUAL/002"})
        assert second.status_code == 200
        path = f"/api/admin/invoices/{created['id']}"
        update = {key: value for key, value in created.items() if key in invoices.InvoiceUpdate.model_fields}
        assert (await client.put(path, json={**update, "invoice_number": "MANUAL/002"})).status_code == 409
        assert (await client.get(path)).json() == created
        changed = await client.put(path, json={**update, "invoice_number": "MY-CUSTOM-003"})
        assert changed.status_code == 200, changed.text
        assert changed.json()["invoice_number"] == "MY-CUSTOM-003"
        assert changed.json()["id"] == created["id"]
        assert changed.json()["totals"] == created["totals"]
        assert (await client.put(path, json={**update, "invoice_number": "MY-CUSTOM-004"})).status_code == 409
        for format in ("pdf", "xlsx"):
            downloaded = await client.get(f"{path}/download/{format}")
            assert downloaded.status_code == 200
            assert f'MY-CUSTOM-003.{format}' in downloaded.headers["content-disposition"]
            if format == "pdf":
                assert "MY-CUSTOM-003" in PdfReader(BytesIO(downloaded.content)).pages[0].extract_text()
            else:
                with ZipFile(BytesIO(downloaded.content)) as archive:
                    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
                    sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
                    assert sheet.find(".//s:c[@r='F4']/s:is/s:t", ns).text == "MY-CUSTOM-003"
        # A client without the new field can still edit an existing invoice.
        update.pop("invoice_number")
        unchanged_number = await client.put(path, json={**update, "revision": 2, "notes": "Updated payment note"})
        assert unchanged_number.status_code == 200
        assert unchanged_number.json()["invoice_number"] == "MY-CUSTOM-003"


@pytest.mark.asyncio
async def test_number_conflicts_with_old_invoices_and_database_races_are_clear(monkeypatch):
    fake = FakeDB()
    fake.invoices = InvoiceCollection()
    fake.invoice_companies = InvoiceCollection()
    fake.clients = InvoiceCollection()
    monkeypatch.setattr(auth, "db", fake)
    monkeypatch.setattr(invoices, "db", fake)
    old = saved_invoice().model_dump(mode="json")
    await fake.invoices.insert_one(old)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://brothersworkforcesolutions.in") as client:
        await client.post("/api/admin/login", json={"pin": "123456"})
        company = (await client.post("/api/admin/invoices/companies", json={"name": "Number collision customer"})).json()
        data = {**payload(), "company_id": company["id"], "invoice_number": old["invoice_number"]}
        conflict = await client.post("/api/admin/invoices", json=data)
        assert conflict.status_code == 409
        assert "number is already in use" in conflict.json()["detail"]

        async def collide(*args, **kwargs):
            raise DuplicateKeyError("invoice_number raced with another save")

        monkeypatch.setattr(fake.invoices, "insert_one", collide)
        raced_create = await client.post("/api/admin/invoices", json={**data, "invoice_number": "MANUAL-RACE-001"})
        assert raced_create.status_code == 409
        assert "number is already in use" in raced_create.json()["detail"]
        monkeypatch.setattr(fake.invoices, "update_one", collide)
        update = {key: value for key, value in old.items() if key in invoices.InvoiceUpdate.model_fields}
        raced_update = await client.put(f"/api/admin/invoices/{old['id']}", json={**update, "invoice_number": "MANUAL-RACE-002"})
        assert raced_update.status_code == 409
        assert "number is already in use" in raced_update.json()["detail"]
        assert fake.invoices.records == [old]

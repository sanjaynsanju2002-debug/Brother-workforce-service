"""Private bills, expense lifecycles, and revenue attribution across months."""

import copy
import os
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "bws_finance_test")

from lib import auth
from lib.months import parse_billing_period
from routers import expenses, finance, invoices
from server import app
from tests.test_admin_session_and_application import FakeDB
from tests.test_invoices import InvoiceCollection, payload


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, keys, direction=None):
        for key, order in reversed(keys if isinstance(keys, list) else [(keys, direction)]):
            self.rows.sort(key=lambda row: row.get(key), reverse=order == -1)
        return self

    def skip(self, count):
        self.rows = self.rows[count:]
        return self

    def limit(self, count):
        self.rows = self.rows[:count]
        return self

    async def to_list(self, count):
        return self.rows[:count]

    def __aiter__(self):
        async def records():
            for row in self.rows:
                yield row
        return records()


class Collection(InvoiceCollection):
    @staticmethod
    def project(row, projection):
        row = copy.deepcopy(row)
        if not projection:
            return row
        included = {key for key, value in projection.items() if value == 1}
        return {key: value for key, value in row.items() if (key in included if included else projection.get(key) != 0)}

    async def find_one(self, query, projection=None):
        row = await super().find_one(query)
        return self.project(row, projection) if row is not None else None

    def find(self, query, projection=None):
        return Cursor([self.project(row, projection) for row in self.records if self.matches(row, query)])

    def aggregate(self, pipeline):
        rows = [row for row in self.records if self.matches(row, pipeline[0]["$match"])]
        if not rows:
            return Cursor([])
        result = {"_id": None}
        for key, expr in pipeline[1]["$group"].items():
            if key != "_id":
                value = expr["$sum"]
                result[key] = sum(row[value[1:]] if isinstance(value, str) else value for row in rows)
        return Cursor([result])

    async def find_one_and_update(self, query, changes, **kwargs):
        row = next((row for row in self.records if self.matches(row, query)), None)
        if row is None:
            if kwargs.get("upsert"):
                row = {**query, "number": 0}
                self.records.append(row)
            else:
                return None
        row.update(copy.deepcopy(changes.get("$set", {})))
        for key, value in changes.get("$inc", {}).items():
            row[key] = row.get(key, 0) + value
        return self.project(row, kwargs.get("projection"))


@pytest.fixture
def db(monkeypatch):
    fake = FakeDB()
    fake.expenses = Collection()
    fake.invoices = Collection()
    fake.invoice_counters = Collection()
    fake.invoice_companies = Collection()
    for module in (auth, expenses, finance, invoices):
        monkeypatch.setattr(module, "db", fake)
    return fake


@pytest.mark.asyncio
async def test_expense_bill_save_retry_month_total_edit_and_delete(db):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://brothersworkforcesolutions.in") as client:
        data = {"request_id": str(uuid4()), "expense_date": "2026-10-15", "description": "Office rent", "amount": "1000.50"}
        files = {"file": ("office-rent.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")}
        assert (await client.post("/api/admin/expenses", data=data, files=files)).status_code == 401
        assert (await client.get("/api/admin/expenses?month=2026-10")).status_code == 401
        assert (await client.get("/api/admin/profit-loss?month=2026-10")).status_code == 401
        assert (await client.post("/api/admin/login", json={"pin": "123456"})).status_code == 200
        created = await client.post("/api/admin/expenses", data=data, files=files)
        assert created.status_code == 200, created.text
        entry = created.json()
        assert entry["amount"] == "1000.50"
        assert entry["bill_filename"] == "office-rent.pdf"
        assert "bill_data" not in entry
        retry = await client.post("/api/admin/expenses", data=data, files=files)
        assert retry.status_code == 200 and retry.json()["id"] == entry["id"]
        assert len(db.expenses.records) == 1
        assert (await client.post("/api/admin/expenses", data={**data, "amount": "999"}, files=files)).status_code == 409
        bill = await client.get(f"/api/admin/expenses/{entry['id']}/bill")
        assert bill.content == files["file"][1]
        assert bill.headers["content-type"] == "application/pdf"
        assert "no-store" in bill.headers["cache-control"]
        october = (await client.get("/api/admin/expenses?month=2026-10")).json()
        assert october["total"] == 1 and october["total_amount"] == "1000.50"
        assert (await client.get("/api/admin/expenses?month=2026-11")).json()["total_amount"] == "0.00"
        changes = {"expense_date": "2026-10-15", "description": "Office rent", "amount": "1100.25", "revision": 1}
        updated = await client.put(f"/api/admin/expenses/{entry['id']}", data=changes)
        assert updated.status_code == 200, updated.text
        assert updated.json()["revision"] == 2 and updated.json()["amount"] == "1100.25"
        assert (await client.put(f"/api/admin/expenses/{entry['id']}", data=changes)).status_code == 409
        assert (await client.get(f"/api/admin/expenses/{entry['id']}/bill")).content == files["file"][1]
        assert (await client.get("/api/admin/profit-loss?month=2026-10")).json()["profit_loss"] == "-1100.25"
        assert (await client.delete(f"/api/admin/expenses/{entry['id']}?revision=1")).status_code == 409
        assert (await client.delete(f"/api/admin/expenses/{entry['id']}?revision=2")).status_code == 200
        assert (await client.get(f"/api/admin/expenses/{entry['id']}/bill")).status_code == 404
        assert (await client.get("/api/admin/expenses?month=2026-10")).json()["total_amount"] == "0.00"
        assert (await client.get("/api/admin/profit-loss?month=2026-10")).json()["profit_loss"] == "0.00"
        client.cookies.clear()
        assert (await client.get(f"/api/admin/expenses/{entry['id']}/bill")).status_code == 401


@pytest.mark.asyncio
async def test_expense_validation_and_pagination_total_are_independent(db):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://brothersworkforcesolutions.in") as client:
        await client.post("/api/admin/login", json={"pin": "123456"})
        base = {"request_id": str(uuid4()), "expense_date": "2026-10-01", "description": "Travel", "amount": "1.50"}
        for change in ({"amount": "-1"}, {"amount": "NaN"}, {"amount": "1.001"}, {"amount": "0"}, {"expense_date": "2026-02-30"}, {"description": " "}):
            assert (await client.post("/api/admin/expenses", data={**base, **change})).status_code == 422
        assert (await client.post("/api/admin/expenses", data=base, files={"file": ("bad.pdf", b"not a PDF", "application/pdf")})).status_code == 422
        assert (await client.post("/api/admin/expenses", data=base, files={"file": ("script.html", b"<script/>", "text/html")})).status_code == 422
        assert (await client.post("/api/admin/expenses", data=base, files={"file": ("big.pdf", b"%PDF-" + b"x" * (5 * 1024 * 1024), "application/pdf")})).status_code == 413
        assert len(db.expenses.records) == 0
        for i in range(51):
            response = await client.post("/api/admin/expenses", data={**base, "request_id": str(uuid4()), "description": f"Cost {i}"})
            assert response.status_code == 200
        page = (await client.get("/api/admin/expenses?month=2026-10&page=2")).json()
        assert page["total"] == 51 and len(page["items"]) == 1 and page["total_amount"] == "76.50"
        for month in ("2026-13", "2026-00", "October 2026", "0000-10"):
            assert (await client.get(f"/api/admin/expenses?month={month}")).status_code == 422
            assert (await client.get(f"/api/admin/profit-loss?month={month}")).status_code == 422


@pytest.mark.asyncio
async def test_service_month_controls_revenue_and_payment_status_only_controls_receivables(db):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://brothersworkforcesolutions.in") as client:
        await client.post("/api/admin/login", json={"pin": "123456"})
        company = (await client.post("/api/admin/invoices/companies", json={"name": "Monthly client"})).json()
        data = payload()
        data.update(company_id=company["id"], invoice_date="2026-11-05", due_date=None, service_month="2026-10", billing_period="", cgst_percentage="9", sgst_percentage="9")
        for line in data["lines"]:
            line.update(quantity="0", rate="0")
        data["lines"][0].update(quantity="10", rate="10000")
        response = await client.post("/api/admin/invoices", json=data)
        assert response.status_code == 200, response.text
        invoice = response.json()
        assert invoice["billing_period"] == "October 2026" and invoice["service_month"] == "2026-10"
        assert (await client.get(f"/api/admin/invoices/{invoice['id']}")).json()["service_month"] == "2026-10"
        db.invoices.records.extend([
            {"invoice_date": "2026-10-01", "service_month": "2026-09", "totals": {"subtotal": "50000.00", "total": "59000.00"}, "payment_status": "Paid"},
            {"invoice_date": "2026-11-09", "billing_period": "Oct 2026", "totals": {"subtotal": "2000.00", "total": "2360.00"}, "payment_status": "Paid"},
            {"invoice_date": "2026-11-12", "billing_period": "Ad hoc", "totals": {"subtotal": "500.00", "total": "590.00"}},
            {"invoice_date": "2027-01-05", "service_month": "2026-12", "totals": {"subtotal": "123.45", "total": "123.45"}},
        ])
        for amount, month in (("100000", "2026-10"), ("1000", "2026-10"), ("999", "2026-11")):
            await client.post("/api/admin/expenses", data={"request_id": str(uuid4()), "expense_date": month + "-01", "description": "Monthly cost", "amount": amount})
        result = (await client.get("/api/admin/profit-loss?month=2026-10")).json()
        assert result["revenue"] == "112000.00"
        assert result["expenses"] == "101000.00" and result["profit_loss"] == "11000.00"
        assert result["invoice_count"] == 2 and result["expense_count"] == 2
        assert result["unpaid_invoice_count"] == 1 and result["unpaid_invoice_amount"] == "129800.00"
        assert result["unassigned_invoice_count"] == 1 and result["unassigned_invoice_revenue"] == "500.00"
        assert (await client.get("/api/admin/profit-loss?month=2026-09")).json()["revenue"] == "50000.00"
        assert (await client.get("/api/admin/profit-loss?month=2026-11")).json()["revenue"] == "0.00"
        assert (await client.get("/api/admin/profit-loss?month=2026-12")).json()["revenue"] == "123.45"
        paid = await client.patch(f"/api/admin/invoices/{invoice['id']}/status", json={"revision": 1, "payment_status": "Paid"})
        assert paid.status_code == 200
        result = (await client.get("/api/admin/profit-loss?month=2026-10")).json()
        assert result["revenue"] == "112000.00" and result["unpaid_invoice_amount"] == "0.00"
        assert (await client.delete(f"/api/admin/invoices/{invoice['id']}?revision=2")).status_code == 204
        result = (await client.get("/api/admin/profit-loss?month=2026-10")).json()
        assert result["revenue"] == "2000.00" and result["profit_loss"] == "-99000.00"


@pytest.mark.parametrize("period,expected", [("October 2026", "2026-10"), ("Oct-2026", "2026-10"), ("10/2026", "2026-10"), ("2026-10", "2026-10"), ("December 2026", "2026-12"), ("October", None), ("Service period", None), ("13/2026", None)])
def test_only_unambiguous_legacy_periods_are_assigned(period, expected):
    assert parse_billing_period(period) == expected

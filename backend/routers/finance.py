"""Monthly revenue and expenses from saved business records."""

from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from lib.auth import require_admin
from lib.db import db
from lib.ledger import received
from lib.months import MONTH_PATTERN, service_month

router = APIRouter(prefix="/admin", dependencies=[Depends(require_admin)])


class ProfitLoss(BaseModel):
    month: str
    revenue: str
    expenses: str
    profit_loss: str
    invoice_count: int
    expense_count: int
    unpaid_invoice_amount: str
    unpaid_invoice_count: int
    unassigned_invoice_count: int
    unassigned_invoice_revenue: str


@router.get("/profit-loss", response_model=ProfitLoss)
async def monthly_profit_loss(month: str = Query(pattern=MONTH_PATTERN)):
    # Saved invoice subtotals are decimal strings. Sum Decimal values, never floats.
    # October services belong to October even when invoiced or paid in November.
    # Read legacy billing periods without guessing a month from the issue date.
    query = {"$or": [{"service_month": month}, {"service_month": None}]}
    revenue = Decimal("0.00")
    unpaid = Decimal("0.00")
    invoice_count = unpaid_count = 0
    unassigned_count = 0
    unassigned_revenue = Decimal("0.00")
    async for invoice in db.invoices.find(query, {"totals": 1, "payment_status": 1, "service_month": 1, "billing_period": 1, "payments": 1, "opening_paid_amount": 1}):
        attributed_month = service_month(invoice)
        if attributed_month is None:
            unassigned_count += 1
            unassigned_revenue += Decimal(str(invoice["totals"]["subtotal"]))
            continue
        if attributed_month != month:
            continue
        revenue += Decimal(str(invoice["totals"]["subtotal"]))
        invoice_count += 1
        balance = max(Decimal("0"), Decimal(str(invoice["totals"]["total"])) - received(invoice))
        if balance > 0:
            unpaid += balance
            unpaid_count += 1
    summary = await db.expenses.aggregate([
        {"$match": {"month": month}},
        {"$group": {"_id": None, "count": {"$sum": 1}, "amount": {"$sum": "$amount_paise"}}},
    ]).to_list(1)
    summary = summary[0] if summary else {"count": 0, "amount": 0}
    expenses = Decimal(summary["amount"]) / 100
    return ProfitLoss(month=month, revenue=f"{revenue:.2f}", expenses=f"{expenses:.2f}",
        profit_loss=f"{revenue - expenses:.2f}", invoice_count=invoice_count,
        expense_count=summary["count"], unpaid_invoice_amount=f"{unpaid:.2f}", unpaid_invoice_count=unpaid_count,
        unassigned_invoice_count=unassigned_count, unassigned_invoice_revenue=f"{unassigned_revenue:.2f}")

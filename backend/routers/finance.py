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
    payroll_cost: str = "0.00"
    operating_expenses: str = "0.00"
    salary_cash_expenses: str = "0.00"
    missing_payroll_companies: int = 0


@router.get("/profit-loss", response_model=ProfitLoss)
async def monthly_profit_loss(month: str = Query(pattern=MONTH_PATTERN)):
    from lib.profitability import profit_report
    report = await profit_report(db, month)
    rows = report["items"]
    def total(field):
        return sum((Decimal(str(r[field])) for r in rows), Decimal("0"))
    costs = total("payroll_cost") + total("operating_expenses")
    return ProfitLoss(month=month, revenue=f"{total('revenue'):.2f}", expenses=f"{costs:.2f}",
        profit_loss=f"{total('profit'):.2f}", invoice_count=sum(r["invoice_count"] for r in rows),
        expense_count=sum(r["expense_count"] for r in rows), unpaid_invoice_amount=f"{total('unpaid'):.2f}",
        unpaid_invoice_count=sum(r["unpaid_count"] for r in rows),
        unassigned_invoice_count=report["unassigned_invoice_count"], unassigned_invoice_revenue=report["unassigned_month_revenue"],
        payroll_cost=f"{total('payroll_cost'):.2f}", operating_expenses=f"{total('operating_expenses'):.2f}",
        salary_cash_expenses=f"{total('salary_cash_expenses'):.2f}",
        missing_payroll_companies=sum(r["invoice_count"] > 0 and r["payroll_registers"] == 0 for r in rows))

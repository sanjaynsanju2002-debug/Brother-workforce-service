"""Shared accrued-profit calculation; salary cash records never duplicate payroll costs."""
from decimal import Decimal
from lib.ledger import amount, money, received
from lib.months import service_month


async def profit_report(db, month):
    companies = await db.clients.find({}, {"id": 1, "name": 1, "archived": 1}).to_list(None)
    rows = {c["id"]: {"company_id": c["id"], "company_name": c["name"], "archived": c.get("archived", False),
            "revenue": Decimal("0"), "payroll_cost": Decimal("0"), "unpaid": Decimal("0"), "unpaid_count": 0, "expense_count": 0, "operating_expenses": Decimal("0"), "salary_cash_expenses": Decimal("0"), "payroll_registers": 0, "invoice_count": 0} for c in companies}
    def row_for(cid, name):
        return rows.setdefault(cid or "unassigned", {"company_id": cid, "company_name": name if cid else "Unassigned company", "archived": False,
            "revenue": Decimal("0"), "payroll_cost": Decimal("0"), "unpaid": Decimal("0"), "unpaid_count": 0, "expense_count": 0, "operating_expenses": Decimal("0"), "salary_cash_expenses": Decimal("0"), "payroll_registers": 0, "invoice_count": 0})
    unassigned_month = Decimal("0")
    unassigned_count = 0
    async for inv in db.invoices.find({}, {"company_id": 1, "client_name": 1, "totals": 1, "service_month": 1, "billing_period": 1, "payments": 1, "opening_paid_amount": 1, "payment_status": 1}):
        attributed = service_month(inv)
        if attributed is None:
            unassigned_month += amount(inv["totals"]["subtotal"])
            unassigned_count += 1
        elif attributed == month:
            r = row_for(inv.get("company_id"), inv.get("client_name", "Company"))
            r["revenue"] += amount(inv["totals"]["subtotal"])
            r["invoice_count"] += 1
            balance = max(Decimal("0"), amount(inv["totals"]["total"]) - received(inv))
            r["unpaid"] += balance
            r["unpaid_count"] += int(balance > 0)
    async for p in db.payroll.find({"month": month}, {"company_id": 1, "company_name": 1, "totals": 1, "cost_responsibility": 1}):
        r = row_for(p["company_id"], p["company_name"])
        r["payroll_registers"] += 1
        if p.get("cost_responsibility", "Agency") == "Agency":
            r["payroll_cost"] += sum((amount(p["totals"].get(k)) for k in ("gross_wages", "esi_employer_contribution", "pf_employer_contribution")), Decimal("0"))
    async for e in db.expenses.find({"month": month}, {"company_id": 1, "company_name": 1, "amount_paise": 1, "cost_type": 1}):
        r = row_for(e.get("company_id"), e.get("company_name", "Company"))
        r["salary_cash_expenses" if e.get("cost_type") == "Payroll" else "operating_expenses"] += Decimal(e["amount_paise"]) / 100
        r["expense_count"] += 1
    data = []
    for r in rows.values():
        r["profit"] = r["revenue"] - r["payroll_cost"] - r["operating_expenses"]
        if r["invoice_count"] or r["payroll_registers"] or r["operating_expenses"] or r["salary_cash_expenses"]:
            data.append({k: money(v) if isinstance(v, Decimal) else v for k, v in r.items()})
    return {"month": month, "items": sorted(data, key=lambda r: r["company_name"].casefold()), "unassigned_month_revenue": money(unassigned_month), "unassigned_invoice_count": unassigned_count}

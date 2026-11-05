"""Allowlisted change summaries; never copy credentials, contact fields or attachments."""
import logging
import re
from collections import Counter
from datetime import date, datetime

FIELDS = {"status", "active", "archived", "visible", "role", "disabled", "company_ids", "revision", "service_month", "month", "payment_status", "opening_paid_amount", "follow_up_date", "cost_responsibility", "expense_date", "amount_paise", "cost_type", "attendance_date", "approved_by", "approved_at", "worker_count", "openings", "closing_date"}
TOTALS = {"subtotal", "total", "gross_wages", "payable", "esi_employer_contribution", "pf_employer_contribution"}
ROUTES = {"workers": "workers", "jobs": "jobs", "clients": "clients", "assignments": "assignments", "team": "admin_users", "invoices": "invoices", "payroll": "payroll", "expenses": "expenses", "attendance": "attendance", "company-requests": "company_requests"}


def summary(doc):
    if not doc:
        return None
    data = {k: v.isoformat() if isinstance(v, (datetime, date)) else v for k, v in doc.items() if k in FIELDS}
    if "totals" in doc:
        data["totals"] = {k: v for k, v in doc["totals"].items() if k in TOTALS}
    for key in ("payments", "salary_payments"):
        if key in doc:
            data[key] = [{k: p.get(k) for k in ("id", "amount", "payment_date", "voided_at") if p.get(k) is not None} for p in doc[key]]
    if "rows" in doc:
        data["attendance_status_counts"] = dict(Counter(r.get("status", "Unmarked") for r in doc["rows"]))
    return data


async def capture(request, db):
    if request.method not in {"POST", "PUT", "PATCH", "DELETE"} or getattr(request.state, "audit_captured", False):
        return
    request.state.audit_captured = True
    match = re.match(r"^/api/admin/(?:operations/)?([^/]+)/([^/]+)(?:/|$)", request.url.path)
    if not match or match[1] not in ROUTES or match[2] in {"companies", "preview", "access"}:
        return
    collection = ROUTES[match[1]]
    try:
        before = await db[collection].find_one({"id": match[2]})
        request.state.audit_target = (collection, match[2])
        request.state.audit_before = summary(before)
    except Exception:
        logging.getLogger(__name__).warning("Could not capture activity summary")


async def changes(request, db):
    target = getattr(request.state, "audit_target", None)
    if not target:
        return {}
    after = summary(await db[target[0]].find_one({"id": target[1]}))
    before = getattr(request.state, "audit_before", None)
    return {"before": before, "after": after} if before != after else {}

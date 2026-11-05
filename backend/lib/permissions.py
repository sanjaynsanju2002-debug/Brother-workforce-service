"""Deny-by-default API permissions; menu visibility is not an access control."""
import re
from fastapi import HTTPException

READ = {"GET", "HEAD", "OPTIONS"}
FINANCE = re.compile(r"^/api/admin/(?:invoices|payroll|expenses|profit-loss|operations/(?:invoices|payroll|salary-register|profitability))(?:/|$)")
RECRUITMENT = re.compile(r"^/api/admin/(?:workers|worker-filters|talents|jobs|job-applications|company-requests|enquiry-aging|shortlists|export|stats|traffic|operations/(?:requirements|recruitment|documents))(?:/|$)")
WORKFORCE = re.compile(r"^/api/admin/(?:clients|assignments)(?:/|$)")


def permits(role: str, path: str, method: str) -> bool:
    if role == "owner":
        return True
    if path in {"/api/admin/me", "/api/admin/logout"}:
        return True
    if method == "DELETE":
        return False  # destructive removal is owner-only
    if role == "viewer" and method not in READ:
        return False
    if path == "/api/admin/operations/attendance-companies":
        return method in READ and role in {"operator", "recruiter", "attendance", "finance", "viewer"}
    if path.startswith("/api/admin/operations/attendance"):
        if "/access" in path:
            return False
        if path.endswith(("/approve", "/reopen")):
            return role == "attendance"
        return role in {"attendance", "operator"} or method in READ and role in {"finance", "viewer"}
    if FINANCE.match(path):
        return role == "finance"
    if WORKFORCE.match(path):
        return role == "operator" or method in READ and role in {"recruiter", "finance", "viewer"}
    if RECRUITMENT.match(path) or re.fullmatch(r"/api/workers/[^/]+/resume", path):
        return role in {"operator", "recruiter", "viewer"}
    return False


async def enforce(principal, request, db):
    if not permits(principal["role"], request.url.path, request.method):
        raise HTTPException(403, "Your role does not have access to this action. Contact the owner.")
    if principal["role"] != "attendance" or request.url.path in {
        "/api/admin/me", "/api/admin/logout", "/api/admin/operations/attendance-companies"
    }:
        return
    company_id = request.query_params.get("company_id")
    if request.method in {"POST", "PUT", "PATCH"}:
        body = await request.json()
        company_id = body.get("company_id", company_id) if isinstance(body, dict) else company_id
    match = re.fullmatch(r"/api/admin/operations/attendance/([^/]+)/(approve|reopen)", request.url.path)
    if match:
        doc = await db.attendance.find_one({"id": match[1]}, {"company_id": 1})
        company_id = doc.get("company_id") if doc else None
    if not company_id or company_id not in principal.get("company_ids", []):
        raise HTTPException(403, "This company is not assigned to your attendance account.")

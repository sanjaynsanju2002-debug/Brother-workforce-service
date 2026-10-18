"""Roster integrity and an idempotent migration for older manual assignments."""

import re
from uuid import NAMESPACE_URL, uuid5

from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from models.bws import Worker


def identity_query(name: str, mobile: str | None) -> dict | None:
    digits = re.sub(r"\D", "", mobile or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    if len(digits) != 10:
        return None
    return {
        "full_name": {"$regex": r"^\s*" + r"\s+".join(re.escape(p) for p in name.split()) + r"\s*$", "$options": "i"},
        "mobile": {"$regex": r"^\D*(?:91\D*)?" + r"\D*".join(digits) + r"\D*$"},
    }


async def sync_worker_status(db, worker_id: str | None) -> None:
    if not worker_id:
        return
    worker = await db.workers.find_one({"id": worker_id})
    if not worker:
        return
    active = await db.assignments.find_one({"worker_id": worker_id, "status": "Active", "company_archived": {"$ne": True}})
    if active or worker.get("status") == "Deployed":
        await db.workers.update_one({"id": worker_id}, {"$set": {"status": "Deployed" if active else "Available"}})


async def check_employee_id(db, company_id: str, employee_id: str | None, assignment_id: str | None = None) -> None:
    if not employee_id:
        return
    matches = await db.assignments.find({"client_id": company_id, "employee_id": {
        "$regex": r"^\s*" + re.escape(employee_id.strip()) + r"\s*$", "$options": "i",
    }}).to_list(None)
    if any(row["id"] != assignment_id for row in matches):
        raise HTTPException(409, "That employee ID is already used in this company. Enter a different ID.")


async def reconcile_workforce(db) -> dict:
    """Never overwrite a candidate's details or merge by name alone."""
    linked = created = 0
    rows = await db.assignments.find({}).to_list(None)
    for row in rows:
        client = await db.clients.find_one({"id": row["client_id"]})
        archived = bool(not client or client.get("archived"))
        changes = {"company_archived": archived}
        worker = await db.workers.find_one({"id": row.get("worker_id")}) if row.get("worker_id") else None
        if not worker:
            query = identity_query(row["full_name"], row.get("mobile"))
            worker = await db.workers.find_one(query) if query else None
            if not worker:
                worker_id = str(uuid5(NAMESPACE_URL, "bws:legacy-assignment:" + row["id"]))
                worker = await db.workers.find_one({"id": worker_id})
                if not worker:
                    talent = Worker(id=worker_id, full_name=row["full_name"], mobile=row.get("mobile") or "",
                                    current_location="Not provided", skill_category="Not provided",
                                    skills=row.get("role"), source="Talent Bank", status="Available")
                    worker = talent.model_dump()
                    try:
                        await db.workers.insert_one(worker)
                        created += 1
                    except DuplicateKeyError:
                        worker = await db.workers.find_one({"id": worker_id})
            changes["worker_id"] = worker["id"]
            linked += 1
        await db.assignments.update_one({"id": row["id"]}, {"$set": changes})
        await sync_worker_status(db, worker["id"])
    return {"linked": linked, "created": created}


async def archive_company(db, client: dict, archived: bool) -> None:
    from lib.companies import company_name_query

    await db.clients.update_one({"id": client["id"]}, {"$set": {"archived": archived}})
    billing = await db.invoice_companies.find({"$or": [{"id": client["id"]}, company_name_query(client["name"])]}).to_list(None)
    for record in billing:
        await db.invoice_companies.update_one({"id": record["id"]}, {"$set": {"archived": archived}})
    assignments = await db.assignments.find({"client_id": client["id"]}).to_list(None)
    for row in assignments:
        await db.assignments.update_one({"id": row["id"]}, {"$set": {"company_archived": archived}})
        await sync_worker_status(db, row.get("worker_id"))


async def reconcile_companies(db) -> None:
    from lib.companies import company_name_query
    from models.clients import Client

    for billing in await db.invoice_companies.find({}).to_list(None):
        existing = await db.clients.find_one({"id": billing["id"]}) or await db.clients.find_one(company_name_query(billing["name"]))
        if not existing:
            client = Client(id=billing["id"], name=billing["name"], billing_address=billing.get("address"),
                            gstin=billing.get("gstin"), visible=False, archived=bool(billing.get("archived")))
            try:
                await db.clients.insert_one({"_id": client.id, **client.model_dump()})
            except DuplicateKeyError:
                pass


async def rename_roster_company(db, client_id: str, name: str) -> None:
    for row in await db.assignments.find({"client_id": client_id}).to_list(None):
        await db.assignments.update_one({"id": row["id"]}, {"$set": {"company_name": name}})

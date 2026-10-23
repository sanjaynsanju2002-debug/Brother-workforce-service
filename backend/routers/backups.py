"""Portable, owner-only business backups with a preview and additive restore."""

import hashlib
import io
import re
from datetime import datetime, timezone
from pathlib import Path
from zipfile import BadZipFile, ZIP_DEFLATED, ZipFile

from bson import json_util
from bson.binary import Binary
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import ValidationError
from pymongo.errors import DuplicateKeyError
from starlette.concurrency import run_in_threadpool

from lib.auth import require_owner
from lib.db import db
from lib.companies import company_name_query
from lib.invoices import Invoice, InvoiceCompany, InvoiceProfile
from lib.payroll import Payroll
from lib.workforce import reconcile_workforce
from models.bws import CompanyRequest, Job, Worker
from models.clients import Client
from routers.assignments import Assignment
from routers.expenses import Expense
from routers.talent import Shortlist
from routers.service_info import ServiceInfo
from models.operations import AttendanceRecord, RequirementRecord, RecruitmentRecord, DocumentRecord, AuditRecord

router = APIRouter(prefix="/admin/backups", dependencies=[Depends(require_owner)])
BASE_COLLECTIONS = ("clients", "invoice_companies", "workers", "jobs", "assignments", "company_requests", "shortlists", "invoices", "payroll", "expenses", "resume_files", "client_logos", "settings")
COLLECTIONS = (*BASE_COLLECTIONS, "attendance", "staffing_requirements", "recruitment", "documents", "audit_events")
MODELS = {"attendance": AttendanceRecord, "staffing_requirements": RequirementRecord, "recruitment": RecruitmentRecord, "documents": DocumentRecord, "audit_events": AuditRecord,"clients": Client, "invoice_companies": InvoiceCompany, "workers": Worker, "jobs": Job,
          "assignments": Assignment, "company_requests": CompanyRequest, "shortlists": Shortlist,
          "invoices": Invoice, "payroll": Payroll, "expenses": Expense}
MAX_BYTES = 64 * 1024 * 1024
MAX_ROWS = 20_000


def identity(collection, record):
    key = "worker_id" if collection == "resume_files" else "client_id" if collection == "client_logos" else "id"
    value = record.get(key)
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", value):
        raise ValueError("A record has an invalid identifier")
    return {key: value}


def read_archive(raw):
    try:
        with ZipFile(io.BytesIO(raw)) as archive:
            names = archive.namelist()
            allowed = {"manifest.json", *(name + ".json" for name in COLLECTIONS)}
            if len(names) != len(set(names)) or not set(names) <= allowed or not {"manifest.json", *(n + ".json" for n in BASE_COLLECTIONS)} <= set(names) or sum(i.file_size for i in archive.infolist()) > MAX_BYTES:
                raise ValueError("Invalid backup contents or backup larger than 64 MB")
            manifest = json_util.loads(archive.read("manifest.json"))
            if not isinstance(manifest, dict) or manifest.get("format") != "bws-business-backup" or manifest.get("version") not in {1, 2}:
                raise ValueError("Unsupported backup format")
            data = {name: json_util.loads(archive.read(name + ".json")) if name + ".json" in names else [] for name in COLLECTIONS}
        total = 0
        for name, rows in data.items():
            if not isinstance(rows, list) or len(rows) > MAX_ROWS:
                raise ValueError("Invalid record list")
            total += len(rows)
            seen = set()
            for row in rows:
                if not isinstance(row, dict):
                    raise ValueError("Invalid record")
                key = str(identity(name, row))
                if key in seen:
                    raise ValueError("Duplicate record in backup")
                seen.add(key)
                if name in MODELS:
                    MODELS[name].model_validate({k: v for k, v in row.items() if (name != "documents" or k != "file_data") and (name != "payroll" or k != "input_hash")})
                if name in {"resume_files", "client_logos"} and (not isinstance(row.get("data"), bytes) or len(row["data"]) > 2 * 1024 * 1024):
                    raise ValueError("Invalid attachment")
                if name == "documents" and row.get("file_data") is not None and (not isinstance(row["file_data"], bytes) or len(row["file_data"]) > 5 * 1024 * 1024):
                    raise ValueError("Invalid document attachment")
                if name == "settings":
                    if row["id"] == "invoice_profile" and not (set(row) - {"id", "profile"}):
                        InvoiceProfile.model_validate(row.get("profile", {}))
                    elif row["id"] == "public_service_info" and not (set(row) - {"id", "enquiry_response_target"}):
                        ServiceInfo.model_validate(row)
                    else:
                        raise ValueError("Security settings cannot be restored")
        if total > MAX_ROWS:
            raise ValueError("Backup contains too many records")
        return manifest, data
    except (BadZipFile, ValueError, KeyError, TypeError, ValidationError, RuntimeError, EOFError, OverflowError) as exc:
        raise HTTPException(422, "This is not a valid BWS business backup. No records were changed.") from exc


async def read_upload(file):
    raw = await file.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "Backup must be 64 MB or smaller")
    return raw, *await run_in_threadpool(read_archive, raw)


def external_resume(worker):
    from routers.public import R2_BUCKET, UPLOAD_DIR, _r2

    if worker.get("resume_object_key") and R2_BUCKET:
        obj = _r2().get_object(Bucket=R2_BUCKET, Key=worker["resume_object_key"])
        try:
            data = obj["Body"].read(2 * 1024 * 1024 + 1)
        finally:
            obj["Body"].close()
        content_type = obj.get("ContentType", "application/octet-stream")
    else:
        stored = UPLOAD_DIR / f"{worker['id']}__{Path(worker['resume_filename']).name}"
        data = stored.read_bytes()
        content_type = "application/octet-stream"
    if len(data) > 2 * 1024 * 1024:
        raise ValueError("Resume exceeds backup attachment limit")
    return {"worker_id": worker["id"], "filename": worker["resume_filename"], "content_type": content_type, "data": Binary(data)}


@router.get("/download")
async def download_backup():
    data = {}
    for name in COLLECTIONS:
        query = {"id": {"$in": ["invoice_profile", "public_service_info"]}} if name == "settings" else {}
        data[name] = await db[name].find(query, {"_id": 0}).to_list(MAX_ROWS + 1)
        if len(data[name]) > MAX_ROWS:
            raise HTTPException(413, "This backup is too large. Ask your website maintainer for a database export.")
    # Session tokens, login credentials and temporary upload authorisations are excluded.
    for worker in data["workers"]:
        for key in ("upload_token_hash", "upload_expires_at"):
            worker.pop(key, None)
    missing = []
    resumes = {row["worker_id"] for row in data["resume_files"]}
    for worker in data["workers"]:
        if worker.get("resume_filename") and worker["id"] not in resumes:
            try:
                data["resume_files"].append(await run_in_threadpool(external_resume, worker))
            except Exception:
                missing.append(worker["id"])
    if sum(len(rows) for rows in data.values()) > MAX_ROWS:
        raise HTTPException(413, "This backup has too many records. Ask your website maintainer for a database export.")
    manifest = {"format": "bws-business-backup", "version": 2, "created_at": datetime.now(timezone.utc),
                "counts": {name: len(rows) for name, rows in data.items()}, "missing_resume_ids": missing,
                "excludes": ["login credentials", "sessions", "email credentials", "analytics", "hosting configuration"],
                "restore": "Adds missing records only; never replaces existing records. Keep a separate database backup for disaster recovery."}
    output = io.BytesIO()
    total = 0
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        for name, rows in {"manifest": manifest, **data}.items():
            encoded = json_util.dumps(rows).encode()
            total += len(encoded)
            if total > MAX_BYTES:
                raise HTTPException(413, "This backup is larger than 64 MB. Ask your website maintainer for a database export.")
            archive.writestr(name + ".json", encoded)
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H%M")
    return Response(output.getvalue(), media_type="application/zip", headers={
        "Content-Disposition": f'attachment; filename="BWS-business-backup-{date}.zip"', "Cache-Control": "no-store",
        "X-BWS-Missing-Resumes": str(len(missing)),
    })


async def existing_record(name, row):
    existing = await db[name].find_one(identity(name, row))
    if name in {"clients", "invoice_companies"} and not existing:
        existing = await db[name].find_one(company_name_query(row["name"]))
    if name == "workers" and not existing and row.get("application_fingerprint"):
        existing = await db.workers.find_one({"application_fingerprint": row["application_fingerprint"]})
    if name == "payroll" and not existing:
        existing = await db.payroll.find_one({"company_id": row["company_id"], "month": row["month"]})
    if name == "invoices" and not existing:
        existing = await db.invoices.find_one({"invoice_number": row["invoice_number"]})
    return existing


@router.post("/inspect")
async def inspect_backup(file: UploadFile = File(...)):
    raw, manifest, data = await read_upload(file)
    counts = {}
    for name, rows in data.items():
        existing = sum([bool(await existing_record(name, row)) for row in rows])
        counts[name] = {"new": len(rows) - existing, "existing": existing}
    return {"sha256": hashlib.sha256(raw).hexdigest(), "created_at": manifest.get("created_at"),
            "counts": counts, "missing_resumes": len(manifest.get("missing_resume_ids", []))}


@router.post("/restore")
async def restore_backup(file: UploadFile = File(...), sha256: str = Form(...)):
    raw, _, data = await read_upload(file)
    if hashlib.sha256(raw).hexdigest() != sha256:
        raise HTTPException(409, "The backup file changed. Preview it again before restoring.")
    added = skipped = 0
    for name, rows in data.items():
        for row in rows:
            if await existing_record(name, row):
                skipped += 1
                continue
            record = {**row}
            # Ensure the same retry cannot insert twice before indexes build.
            record["_id"] = next(iter(identity(name, row).values()))
            try:
                await db[name].insert_one(record)
                added += 1
            except DuplicateKeyError:
                skipped += 1
    await reconcile_workforce(db)
    return {"ok": True, "added": added, "skipped": skipped}

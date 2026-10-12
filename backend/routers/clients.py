"""Client companies: public read and session-protected admin CRUD with logo upload."""

import os
import re
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from bson.binary import Binary

from lib.auth import require_admin
from lib.db import db
from models.clients import Client, ClientCreate, ClientUpdate
from models.bws import Ok

router = APIRouter()

LOGO_DIR = Path(__file__).parent.parent / "uploads" / "logos"
LOGO_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp", ".svg"}
MEDIA_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml"}
MAX_LOGO_BYTES = 2 * 1024 * 1024



# ---------- public ----------
@router.get("/clients", response_model=list[Client])
async def list_public_clients() -> list[Client]:
    docs = await db.clients.find({"visible": True}, {"_id": 0}).sort("sort_order", 1).to_list(200)
    return [Client(**d) for d in docs]


@router.get("/clients/{client_id}/logo")
async def get_logo(client_id: str) -> Response:
    doc = await db.clients.find_one({"id": client_id})
    if not doc or not doc.get("logo_filename"):
        raise HTTPException(status_code=404, detail="No logo on file")
    logo = await db.client_logos.find_one({"client_id": client_id})
    if logo:
        return Response(
            content=logo["data"],
            media_type=logo["content_type"],
            headers={"Cache-Control": "public, max-age=3600"},
        )
    # Support files from older installations until they are re-uploaded.
    stored = LOGO_DIR / f"{client_id}__{doc['logo_filename']}"
    if stored.exists():
        return FileResponse(stored)
    raise HTTPException(status_code=404, detail="No logo on file")


# ---------- admin ----------
@router.get("/admin/clients", response_model=list[Client], dependencies=[Depends(require_admin)])
async def list_all_clients() -> list[Client]:
    docs = await db.clients.find({}, {"_id": 0}).sort("sort_order", 1).to_list(200)
    return [Client(**d) for d in docs]


@router.post("/admin/clients", response_model=Client, dependencies=[Depends(require_admin)])
async def create_client(payload: ClientCreate) -> Client:
    count = await db.clients.count_documents({})
    client = Client(**payload.model_dump(), sort_order=count)
    await db.clients.insert_one(client.model_dump())
    return client


@router.patch("/admin/clients/{client_id}", response_model=Client, dependencies=[Depends(require_admin)])
async def update_client(client_id: str, payload: ClientUpdate) -> Client:
    changes = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not changes:
        raise HTTPException(status_code=400, detail="Nothing to update")
    doc = await db.clients.find_one_and_update(
        {"id": client_id}, {"$set": changes}, return_document=True, projection={"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Client not found")
    return Client(**doc)


@router.post("/admin/clients/{client_id}/logo", response_model=Client, dependencies=[Depends(require_admin)])
async def upload_logo(client_id: str, file: UploadFile = File(...)) -> Client:
    doc = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Client not found")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"Unsupported image type: {ext or 'unknown'}")

    data = await file.read(MAX_LOGO_BYTES + 1)
    if len(data) > MAX_LOGO_BYTES:
        raise HTTPException(status_code=413, detail="Logo must be 2 MB or smaller")

    safe = re.sub(r"[^A-Za-z0-9._-]", "_", Path(file.filename or "logo").name)
    await db.client_logos.update_one(
        {"client_id": client_id},
        {"$set": {"data": Binary(data), "content_type": MEDIA_TYPES[ext]}},
        upsert=True,
    )
    await db.clients.update_one({"id": client_id}, {"$set": {"logo_filename": safe}})
    doc["logo_filename"] = safe
    return Client(**doc)


@router.delete("/admin/clients/{client_id}", response_model=Ok, dependencies=[Depends(require_admin)])
async def delete_client(client_id: str) -> Ok:
    res = await db.clients.delete_one({"id": client_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    await db.client_logos.delete_one({"client_id": client_id})
    for f in LOGO_DIR.glob(f"{client_id}__*"):
        f.unlink(missing_ok=True)
    return Ok(ok=True)

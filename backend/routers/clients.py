"""Client companies: public read + PIN-protected admin CRUD with logo upload."""

import os
import re
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from lib.auth import verify_pin
from lib.db import db
from models.clients import Client, ClientCreate, ClientUpdate
from models.bws import Ok

router = APIRouter()

LOGO_DIR = Path(__file__).parent.parent / "uploads" / "logos"
LOGO_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp", ".svg"}



# ---------- public ----------
@router.get("/clients", response_model=list[Client])
async def list_public_clients() -> list[Client]:
    docs = await db.clients.find({"visible": True}, {"_id": 0}).sort("sort_order", 1).to_list(200)
    return [Client(**d) for d in docs]


@router.get("/clients/{client_id}/logo")
async def get_logo(client_id: str) -> FileResponse:
    doc = await db.clients.find_one({"id": client_id})
    if not doc or not doc.get("logo_filename"):
        raise HTTPException(status_code=404, detail="No logo on file")
    stored = LOGO_DIR / f"{client_id}__{doc['logo_filename']}"
    if not stored.exists():
        raise HTTPException(status_code=404, detail="No logo on file")
    return FileResponse(stored)


# ---------- admin ----------
@router.get("/admin/clients", response_model=list[Client])
async def list_all_clients(pin: str = Query(...)) -> list[Client]:
    await verify_pin(pin)
    docs = await db.clients.find({}, {"_id": 0}).sort("sort_order", 1).to_list(200)
    return [Client(**d) for d in docs]


@router.post("/admin/clients", response_model=Client)
async def create_client(payload: ClientCreate, pin: str = Query(...)) -> Client:
    await verify_pin(pin)
    count = await db.clients.count_documents({})
    client = Client(**payload.model_dump(), sort_order=count)
    await db.clients.insert_one(client.model_dump())
    return client


@router.patch("/admin/clients/{client_id}", response_model=Client)
async def update_client(client_id: str, payload: ClientUpdate, pin: str = Query(...)) -> Client:
    await verify_pin(pin)
    changes = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not changes:
        raise HTTPException(status_code=400, detail="Nothing to update")
    doc = await db.clients.find_one_and_update(
        {"id": client_id}, {"$set": changes}, return_document=True, projection={"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Client not found")
    return Client(**doc)


@router.post("/admin/clients/{client_id}/logo", response_model=Client)
async def upload_logo(client_id: str, pin: str = Query(...), file: UploadFile = File(...)) -> Client:
    await verify_pin(pin)
    doc = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Client not found")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"Unsupported image type: {ext or 'unknown'}")

    safe = re.sub(r"[^A-Za-z0-9._-]", "_", Path(file.filename or "logo").name)
    (LOGO_DIR / f"{client_id}__{safe}").write_bytes(await file.read())
    await db.clients.update_one({"id": client_id}, {"$set": {"logo_filename": safe}})
    doc["logo_filename"] = safe
    return Client(**doc)


@router.delete("/admin/clients/{client_id}", response_model=Ok)
async def delete_client(client_id: str, pin: str = Query(...)) -> Ok:
    await verify_pin(pin)
    res = await db.clients.delete_one({"id": client_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    for f in LOGO_DIR.glob(f"{client_id}__*"):
        f.unlink(missing_ok=True)
    return Ok(ok=True)

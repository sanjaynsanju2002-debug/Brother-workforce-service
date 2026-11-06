"""Owner-managed named staff accounts. Credentials never appear in responses."""

import re
import secrets
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from lib.auth import _hash_pin, require_owner
from lib.db import db

router = APIRouter(prefix="/admin/team", dependencies=[Depends(require_owner)])


class StaffCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    username: str = Field(min_length=3, max_length=50)
    pin: str = Field(pattern=r"^\d{8,12}$")
    role: Literal["operator", "viewer", "recruiter", "attendance", "finance"] = "recruiter"
    company_ids: list[str] = Field(default_factory=list, max_length=200)


class StaffUpdate(BaseModel):
    company_ids: list[str] | None = Field(default=None, max_length=200)
    disabled: bool | None = None
    role: Literal["operator", "viewer", "recruiter", "attendance", "finance"] | None = None
    pin: str | None = Field(default=None, pattern=r"^\d{8,12}$")


async def validate_companies(company_ids):
    for cid in set(company_ids):
        if not await db.clients.find_one({"id": cid, "archived": {"$ne": True}}, {"id": 1}):
            raise HTTPException(422, "Choose an active company from the list")


def public_user(row):
    return {**{key: row[key] for key in ("id", "name", "username", "role", "disabled", "created_at")}, "company_ids": row.get("company_ids", [])}


@router.get("")
async def list_staff():
    return [public_user(row) for row in await db.admin_users.find({}).sort("name", 1).to_list(200)]


@router.post("")
async def create_staff(payload: StaffCreate):
    username = payload.username.strip().lower()
    if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{2,49}", username) or username in {"owner", "admin"}:
        raise HTTPException(422, "Use 3–50 letters, numbers, dots, underscores or hyphens; owner and admin are reserved")
    if not payload.name.strip():
        raise HTTPException(422, "Enter the staff member's name")
    if await db.admin_users.find_one({"username": username}):
        raise HTTPException(409, "This account name is already used")
    if payload.role == "attendance" and not payload.company_ids:
        raise HTTPException(422, "Assign at least one company to attendance staff")
    await validate_companies(payload.company_ids)
    salt = secrets.token_hex(16)
    user = {"id": str(uuid4()), "name": payload.name.strip(), "username": username, "role": payload.role,
            "pin_salt": salt, "pin_hash": _hash_pin(payload.pin, salt), "disabled": False, "company_ids": list(dict.fromkeys(payload.company_ids)),
            "created_at": datetime.now(timezone.utc)}
    try:
        await db.admin_users.insert_one({"_id": username, **user})
    except DuplicateKeyError:
        raise HTTPException(409, "This account name is already used")
    return public_user(user)


@router.patch("/{user_id}")
async def update_staff(user_id: str, payload: StaffUpdate):
    before = await db.admin_users.find_one({"id": user_id})
    if not before:
        raise HTTPException(404, "Staff account not found")
    changes = payload.model_dump(exclude_none=True, exclude={"pin"})
    if (payload.role or before["role"]) == "attendance" and not (payload.company_ids if payload.company_ids is not None else before.get("company_ids", [])):
        raise HTTPException(422, "Assign at least one company to attendance staff")
    if payload.company_ids is not None:
        await validate_companies(payload.company_ids)
    if payload.pin:
        salt = secrets.token_hex(16)
        changes.update(pin_salt=salt, pin_hash=_hash_pin(payload.pin, salt))
    await db.admin_users.update_one({"id": user_id}, {"$set": changes})
    # Immediately revoke sessions when access or credentials change.
    await db.admin_sessions.delete_many({"user_id": user_id})
    return public_user({**before, **changes})

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
    role: Literal["operator", "viewer"] = "operator"


class StaffUpdate(BaseModel):
    disabled: bool | None = None
    role: Literal["operator", "viewer"] | None = None
    pin: str | None = Field(default=None, pattern=r"^\d{8,12}$")


def public_user(row):
    return {key: row[key] for key in ("id", "name", "username", "role", "disabled", "created_at")}


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
    salt = secrets.token_hex(16)
    user = {"id": str(uuid4()), "name": payload.name.strip(), "username": username, "role": payload.role,
            "pin_salt": salt, "pin_hash": _hash_pin(payload.pin, salt), "disabled": False,
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
    if payload.pin:
        salt = secrets.token_hex(16)
        changes.update(pin_salt=salt, pin_hash=_hash_pin(payload.pin, salt))
    await db.admin_users.update_one({"id": user_id}, {"$set": changes})
    # Immediately revoke sessions when access or credentials change.
    await db.admin_sessions.delete_many({"user_id": user_id})
    return public_user({**before, **changes})

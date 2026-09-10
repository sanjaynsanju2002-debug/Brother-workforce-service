"""Admin PIN verification.

The PIN lives in the `settings` collection (doc id="admin") so it can be changed from the
dashboard, falling back to the ADMIN_PIN env value when never changed.
"""

import os

from fastapi import HTTPException

from lib.db import db

ADMIN_DOC_ID = "admin"


def env_pin() -> str:
    return os.environ.get("ADMIN_PIN", "246810")


async def current_pin() -> str:
    doc = await db.settings.find_one({"id": ADMIN_DOC_ID}, {"_id": 0})
    if doc and doc.get("pin"):
        return str(doc["pin"])
    return env_pin()


async def verify_pin(pin: str) -> None:
    if pin != await current_pin():
        raise HTTPException(status_code=401, detail="Invalid PIN")


async def set_pin(new_pin: str) -> None:
    await db.settings.update_one(
        {"id": ADMIN_DOC_ID}, {"$set": {"id": ADMIN_DOC_ID, "pin": new_pin}}, upsert=True
    )

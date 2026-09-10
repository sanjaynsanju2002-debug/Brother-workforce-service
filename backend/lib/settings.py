"""App settings persisted in Mongo so the sender address can change without editing .env.

Single document in `settings` with id="email". Env values are the fallback defaults.
"""

import os
from typing import Any

from lib.db import db

EMAIL_DOC_ID = "email"


def _defaults() -> dict[str, Any]:
    return {
        "sender": os.environ.get("SENDER_EMAIL", "onboarding@resend.dev"),
        "recipients": [os.environ.get("NOTIFY_EMAIL", "brothersworkforcesolutions@gmail.com")],
    }


async def get_email_settings() -> dict[str, Any]:
    doc = await db.settings.find_one({"id": EMAIL_DOC_ID}, {"_id": 0})
    merged = _defaults()
    if doc:
        if doc.get("sender"):
            merged["sender"] = doc["sender"]
        if doc.get("recipients"):
            merged["recipients"] = doc["recipients"]
    return merged


async def save_email_settings(sender: str, recipients: list[str]) -> dict[str, Any]:
    await db.settings.update_one(
        {"id": EMAIL_DOC_ID},
        {"$set": {"id": EMAIL_DOC_ID, "sender": sender, "recipients": recipients}},
        upsert=True,
    )
    return await get_email_settings()

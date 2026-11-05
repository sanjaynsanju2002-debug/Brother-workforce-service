"""Shared fixed-window request budgets; IP addresses are hashed and expire."""
import hashlib
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError


async def limit_submission(db, request, category, limit=30):
    now = datetime.now(timezone.utc)
    window = int(now.timestamp()) // 900
    # Trust only the ASGI peer, configured by the trusted hosting proxy.
    peer = request.client.host if request.client else "unknown"
    key = hashlib.sha256(f"{category}:{peer}:{window}".encode()).hexdigest()
    update = {"$inc": {"count": 1}, "$setOnInsert": {"expires_at": now + timedelta(minutes=30)}}
    try:
        record = await db.public_rate_limits.find_one_and_update(
            {"_id": key}, update, upsert=True, return_document=ReturnDocument.AFTER)
    except DuplicateKeyError:
        record = await db.public_rate_limits.find_one_and_update(
            {"_id": key}, {"$inc": {"count": 1}}, return_document=ReturnDocument.AFTER)
    if not record or record["count"] > limit:
        raise HTTPException(429, "Too many submissions. Please try again in 15 minutes.", headers={"Retry-After": "900"})

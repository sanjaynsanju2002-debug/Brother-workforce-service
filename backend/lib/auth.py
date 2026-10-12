"""Admin PIN verification and short-lived, server-side sessions."""

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request, Response

from lib.db import db

ADMIN_DOC_ID = "admin"
COOKIE_NAME = "bws_admin_session"
SESSION_SECONDS = 8 * 60 * 60
MAX_LOGIN_ATTEMPTS = 8
LOGIN_WINDOW = timedelta(minutes=15)


def env_pin() -> str:
    # Kept for existing installations. The dashboard prompts a change if it is still active.
    return os.environ.get("ADMIN_PIN", "246810")


def _hash_pin(pin: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), 250_000).hex()


def _session_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def verify_pin(pin: str) -> None:
    doc = await db.settings.find_one({"id": ADMIN_DOC_ID}, {"_id": 0})
    if doc and doc.get("pin_hash") and doc.get("pin_salt"):
        valid = hmac.compare_digest(_hash_pin(pin, doc["pin_salt"]), doc["pin_hash"])
    elif doc and doc.get("pin"):
        valid = hmac.compare_digest(pin, str(doc["pin"]))
        if valid:
            salt = secrets.token_hex(16)
            await db.settings.update_one(
                {"id": ADMIN_DOC_ID},
                {"$set": {"pin_hash": _hash_pin(pin, salt), "pin_salt": salt}, "$unset": {"pin": ""}},
            )
    else:
        valid = hmac.compare_digest(pin, env_pin())
    if not valid:
        raise HTTPException(status_code=401, detail="Invalid PIN")


async def uses_setup_pin() -> bool:
    doc = await db.settings.find_one({"id": ADMIN_DOC_ID}, {"_id": 0})
    if not doc:
        return True
    if doc.get("pin_hash") and doc.get("pin_salt"):
        return hmac.compare_digest(_hash_pin(env_pin(), doc["pin_salt"]), doc["pin_hash"])
    return not doc.get("pin") or hmac.compare_digest(str(doc["pin"]), env_pin())


async def set_pin(new_pin: str) -> None:
    salt = secrets.token_hex(16)
    await db.settings.update_one(
        {"id": ADMIN_DOC_ID},
        {"$set": {"id": ADMIN_DOC_ID, "pin_hash": _hash_pin(new_pin, salt), "pin_salt": salt}, "$unset": {"pin": ""}},
        upsert=True,
    )
    # Changing the PIN signs out every browser, including the current one.
    await db.admin_sessions.delete_many({})


async def login_with_pin(pin: str, request: Request, response: Response) -> None:
    now = datetime.now(timezone.utc)
    ip = request.client.host if request.client else "unknown"
    await db.admin_login_attempts.delete_many({"id": ip, "expires_at": {"$lte": now}})
    attempt = await db.admin_login_attempts.find_one({"id": ip, "expires_at": {"$gt": now}})
    if attempt and attempt.get("count", 0) >= MAX_LOGIN_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many attempts. Try again in 15 minutes.")
    try:
        await verify_pin(pin)
    except HTTPException:
        await db.admin_login_attempts.update_one(
            {"id": ip},
            {"$inc": {"count": 1}, "$set": {"expires_at": now + LOGIN_WINDOW}},
            upsert=True,
        )
        raise
    await db.admin_login_attempts.delete_one({"id": ip})
    token = secrets.token_urlsafe(32)
    await db.admin_sessions.insert_one({
        "token_hash": _session_hash(token),
        "created_at": now,
        "expires_at": now + timedelta(seconds=SESSION_SECONDS),
    })
    response.set_cookie(
        COOKIE_NAME, token, max_age=SESSION_SECONDS, path="/api",
        secure=request.url.hostname not in {"localhost", "127.0.0.1"}, httponly=True, samesite="strict",
    )


async def require_admin(request: Request) -> None:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Please sign in again")
    now = datetime.now(timezone.utc)
    session = await db.admin_sessions.find_one({
        "token_hash": _session_hash(token), "expires_at": {"$gt": now},
    })
    if not session:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        host = request.headers.get("host", "")
        if origin and origin not in {f"https://{host}", f"http://{host}"}:
            raise HTTPException(status_code=403, detail="Invalid request origin")
        if request.headers.get("sec-fetch-site") not in {None, "same-origin", "none"}:
            raise HTTPException(status_code=403, detail="Cross-site request blocked")


async def logout(request: Request, response: Response) -> None:
    token = request.cookies.get(COOKIE_NAME)
    if token:
        await db.admin_sessions.delete_one({"token_hash": _session_hash(token)})
    response.delete_cookie(COOKIE_NAME, path="/api")

"""Email settings + Resend domain verification, PIN-protected.

The Resend API key is read from the environment server-side and is NEVER returned to the
frontend — these endpoints only expose domain names, statuses and the public DNS records the
owner must publish at their registrar.
"""

import asyncio
import logging
import os
import re

from fastapi import APIRouter, HTTPException, Query

from lib.notify import build_html, email_configured, send_email
from lib.settings import get_email_settings, save_email_settings
from models.bws import (
    DomainCreate,
    EmailDomain,
    EmailSettingsUpdate,
    EmailStatus,
    Ok,
    TestEmail,
    TestEmailResult,
)

router = APIRouter(prefix="/email")
logger = logging.getLogger(__name__)

SHARED_SENDERS = {"onboarding@resend.dev", "delivered@resend.dev"}
DOMAIN_RE = re.compile(r"^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,}$")



def _resend():
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="RESEND_API_KEY is not configured on the server")
    import resend

    resend.api_key = api_key
    return resend


def _to_domain(raw: dict) -> EmailDomain:
    records = raw.get("records") or []
    return EmailDomain(
        id=str(raw.get("id", "")),
        name=str(raw.get("name", "")),
        status=str(raw.get("status", "unknown")),
        region=raw.get("region"),
        created_at=raw.get("created_at"),
        records=[  # type: ignore[arg-type]
            {
                "record": r.get("record"),
                "name": r.get("name"),
                "type": r.get("type"),
                "ttl": r.get("ttl"),
                "status": r.get("status"),
                "value": r.get("value"),
                "priority": r.get("priority"),
            }
            for r in records
        ],
    )


@router.get("/status", response_model=EmailStatus)
async def email_status(pin: str = Query(...)) -> EmailStatus:
    await verify_pin(pin)
    cfg = await get_email_settings()
    status = EmailStatus(
        key_configured=email_configured(),
        sender=cfg["sender"],
        recipients=cfg["recipients"],
        using_shared_sender=cfg["sender"].split("@")[-1].lower() in {"resend.dev"},
    )
    if not status.key_configured:
        return status
    try:
        resend = _resend()
        result = await asyncio.to_thread(resend.Domains.list)
        raw = result.get("data", []) if isinstance(result, dict) else []
        status.domains = [_to_domain(d) for d in raw]
    except Exception as exc:
        logger.error("Domains.list failed: %s", exc)
        status.error = str(exc)
        if "restricted" in str(exc).lower():
            status.key_restricted = True
    return status


@router.post("/domains", response_model=EmailDomain)
async def add_domain(payload: DomainCreate, pin: str = Query(...)) -> EmailDomain:
    await verify_pin(pin)
    name = payload.name.strip().lower().removeprefix("http://").removeprefix("https://").strip("/")
    name = name.removeprefix("www.")
    if not DOMAIN_RE.match(name):
        raise HTTPException(status_code=400, detail="Enter a valid domain, e.g. brothersworkforce.in")
    resend = _resend()
    try:
        created = await asyncio.to_thread(resend.Domains.create, {"name": name})
    except Exception as exc:
        detail = str(exc)
        if "restricted" in detail.lower():
            detail = (
                "Your Resend API key is send-only, so it cannot manage domains. "
                "Create a Full Access key in Resend (API Keys -> Create API Key -> Full access) "
                "and ask your developer to update RESEND_API_KEY, or add the domain directly in "
                "the Resend dashboard under Domains."
            )
        raise HTTPException(status_code=400, detail=detail) from exc
    return _to_domain(created if isinstance(created, dict) else {})


@router.post("/domains/{domain_id}/verify", response_model=EmailDomain)
async def verify_domain(domain_id: str, pin: str = Query(...)) -> EmailDomain:
    await verify_pin(pin)
    resend = _resend()
    try:
        await asyncio.to_thread(resend.Domains.verify, domain_id)
        fresh = await asyncio.to_thread(resend.Domains.get, domain_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Verification check failed: {exc}") from exc
    return _to_domain(fresh if isinstance(fresh, dict) else {})


@router.delete("/domains/{domain_id}", response_model=Ok)
async def remove_domain(domain_id: str, pin: str = Query(...)) -> Ok:
    await verify_pin(pin)
    resend = _resend()
    try:
        await asyncio.to_thread(resend.Domains.remove, domain_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not remove domain: {exc}") from exc
    return Ok(ok=True)


@router.put("/settings", response_model=EmailStatus)
async def update_settings(payload: EmailSettingsUpdate, pin: str = Query(...)) -> EmailStatus:
    await verify_pin(pin)
    sender = payload.sender.strip()
    recipients = [r.strip() for r in payload.recipients if r.strip()]
    if "@" not in sender:
        raise HTTPException(status_code=400, detail="Sender must be a valid email address")
    if not recipients:
        raise HTTPException(status_code=400, detail="At least one recipient is required")
    for r in recipients:
        if "@" not in r:
            raise HTTPException(status_code=400, detail=f"Invalid recipient address: {r}")
    await save_email_settings(sender, recipients)
    return await email_status(pin=pin)


@router.post("/test", response_model=TestEmailResult)
async def send_test(payload: TestEmail, pin: str = Query(...)) -> TestEmailResult:
    await verify_pin(pin)
    if not email_configured():
        raise HTTPException(status_code=400, detail="RESEND_API_KEY is not configured on the server")
    cfg = await get_email_settings()
    to = [payload.to.strip()] if payload.to and payload.to.strip() else cfg["recipients"]
    html = build_html(
        "Test Notification",
        [
            ("Result", "Email delivery is working"),
            ("Sender", cfg["sender"]),
            ("Recipient", ", ".join(to)),
        ],
    )
    try:
        email_id = await send_email("Test Email — Brothers Workforce Solutions", html, cfg["sender"], to)
    except Exception as exc:
        return TestEmailResult(ok=False, sent_to=to, detail=str(exc))
    return TestEmailResult(ok=True, email_id=email_id, sent_to=to)

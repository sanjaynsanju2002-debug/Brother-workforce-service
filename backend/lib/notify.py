"""Email notifications via Resend.

The API key lives in backend/.env as RESEND_API_KEY and is read server-side only — it is
never returned to the frontend. If the key is absent, sending is a logged no-op so that a
form submission NEVER fails because email is unconfigured.
"""

import asyncio
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


def email_configured() -> bool:
    return bool(os.environ.get("RESEND_API_KEY"))


def _rows(pairs: list[tuple[str, Any]]) -> str:
    out = []
    for label, value in pairs:
        if value in (None, "", []):
            continue
        out.append(
            '<tr>'
            '<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#475569;'
            'font-family:Arial,sans-serif;font-size:13px;width:38%">' + str(label) + "</td>"
            '<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;'
            'font-family:Arial,sans-serif;font-size:13px;font-weight:bold">' + str(value) + "</td>"
            "</tr>"
        )
    return "".join(out)


def build_html(title: str, pairs: list[tuple[str, Any]]) -> str:
    return (
        '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px">'
        '<tr><td align="center">'
        '<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:6px">'
        '<tr><td style="background:#0f2444;padding:20px 24px;border-radius:6px 6px 0 0">'
        '<div style="color:#ffffff;font-family:Arial,sans-serif;font-size:18px;font-weight:bold">'
        "BROTHERS <span style=\"color:#fb923c\">WORKFORCE</span> SOLUTIONS</div>"
        '<div style="color:#94a3b8;font-family:Arial,sans-serif;font-size:12px;margin-top:4px">'
        + title
        + "</div></td></tr>"
        '<tr><td style="padding:20px 24px"><table width="100%" cellpadding="0" cellspacing="0">'
        + _rows(pairs)
        + "</table></td></tr>"
        '<tr><td style="padding:16px 24px;background:#f1f5f9;color:#64748b;'
        'font-family:Arial,sans-serif;font-size:11px;border-radius:0 0 6px 6px">'
        "Automated notification from your website. Sign in to the admin dashboard to respond."
        "</td></tr></table></td></tr></table>"
    )


async def send_email(subject: str, html: str, sender: str, recipients: list[str]) -> str:
    """Low-level send. Raises on failure — callers decide how to handle it."""
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        raise RuntimeError("RESEND_API_KEY is not configured")

    import resend

    resend.api_key = api_key
    params = {"from": sender, "to": recipients, "subject": subject, "html": html}
    result = await asyncio.to_thread(resend.Emails.send, params)
    return str(result.get("id", ""))


async def send_notification(subject: str, html: str) -> None:
    """Fire-and-forget: never raises, never blocks the request path."""
    if not email_configured():
        logger.warning("RESEND_API_KEY not set — skipping email notification: %s", subject)
        return
    try:
        from lib.settings import get_email_settings

        cfg = await get_email_settings()
        email_id = await send_email(subject, html, cfg["sender"], cfg["recipients"])
        logger.info("notification email sent (%s): %s", subject, email_id)
    except Exception as exc:  # a broken mailbox must never break a form submission
        logger.error("notification email failed (%s): %s", subject, exc)

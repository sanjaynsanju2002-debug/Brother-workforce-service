"""Automatic previous-day attendance emails, one message per active company."""

import asyncio
import logging
import os
from datetime import date, datetime, time, timedelta, timezone
from html import escape
from uuid import uuid4
from zoneinfo import ZoneInfo

from pymongo.errors import DuplicateKeyError

from lib.daily_attendance import daily_attendance_report_data
from lib.db import db
from lib.notify import email_configured, send_email
from lib.settings import get_email_settings

logger = logging.getLogger(__name__)
INDIA = ZoneInfo("Asia/Kolkata")
REPORT_TIME = time(hour=8)


def _cell(value, *, strong: bool = False) -> str:
    text = escape(str(value if value not in (None, "") else "—"))
    if strong:
        text = f"<strong>{text}</strong>"
    return f'<td style="padding:8px;border-bottom:1px solid #e2e8f0;font:12px Arial;color:#0f172a">{text}</td>'


def daily_report_email_html(report: dict) -> str:
    """Build a compact, escaped email table. The dashboard retains the complete report."""
    displayed = report["rows"][:250]
    rows = "".join(
        "<tr>"
        + _cell(row.get("employee_id"))
        + _cell(row["full_name"], strong=True)
        + _cell(row.get("role"))
        + _cell(row["shift"])
        + _cell(row.get("check_in_time"))
        + _cell(row.get("check_out_time"))
        + _cell(row.get("worked_hours"))
        + _cell(row["status"])
        + _cell(row["record_state"])
        + _cell("Ready" if row["payroll_ready"] else "Pending")
        + "</tr>"
        for row in displayed
    )
    if not rows:
        rows = '<tr><td colspan="10" style="padding:20px;text-align:center;font:13px Arial;color:#64748b">No employees were assigned for this date.</td></tr>'
    truncated = ""
    if len(report["rows"]) > len(displayed):
        truncated = f'<p style="font:12px Arial;color:#64748b">Showing the first {len(displayed)} employees. Open the attendance dashboard for the complete report.</p>'
    attendance_url = escape(os.environ.get("ATTENDANCE_APP_ORIGIN", "https://brothers-workforce-attendance.onrender.com").rstrip("/"))
    report_day = date.fromisoformat(report["report_date"]).strftime("%d %b %Y")
    totals = report["totals"]
    return (
        '<div style="background:#f1f5f9;padding:24px">'
        '<div style="max-width:1000px;margin:auto;background:white;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">'
        '<div style="background:#0f2444;padding:20px 24px;color:white;font-family:Arial">'
        '<div style="font-size:18px;font-weight:bold">BROTHERS <span style="color:#fb923c">WORKFORCE</span> SOLUTIONS</div>'
        '<div style="margin-top:5px;font-size:12px;color:#cbd5e1">Daily attendance report</div></div>'
        '<div style="padding:20px 24px;font-family:Arial;color:#0f172a">'
        f'<h2 style="margin:0">{escape(report["company_name"])}</h2>'
        f'<p style="margin:6px 0 16px;color:#64748b">Attendance for {report_day} · Daily 8:00 AM IST report</p>'
        '<table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:18px;background:#f8fafc;border:1px solid #e2e8f0">'
        f'<tr>{_cell("Employees")}{_cell(totals["employees"], strong=True)}{_cell("Worked")}{_cell(totals["worked"], strong=True)}{_cell("Completed")}{_cell(totals["completed"], strong=True)}</tr>'
        f'<tr>{_cell("Missing check-out")}{_cell(totals["missing_check_out"], strong=True)}{_cell("Payroll-ready")}{_cell(totals["payroll_ready"], strong=True)}{_cell("Worked hours")}{_cell(totals["worked_hours"], strong=True)}</tr>'
        '</table><div style="overflow-x:auto"><table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e2e8f0">'
        '<thead><tr style="background:#0f2444;color:white">'
        + "".join(f'<th style="padding:8px;text-align:left;font:12px Arial">{heading}</th>' for heading in (
            "Employee ID", "Name", "Role", "Shift", "Check in", "Check out", "Hours", "Attendance", "Record", "Payroll",
        ))
        + f"</tr></thead><tbody>{rows}</tbody></table></div>{truncated}"
        + (f'<p style="font:12px Arial;color:#475569"><strong>Day notes:</strong> {escape(report["notes"])}</p>' if report.get("notes") else "")
        + f'<p style="margin-top:18px"><a href="{attendance_url}" style="display:inline-block;background:#ea580c;color:white;text-decoration:none;padding:10px 14px;border-radius:7px;font:bold 13px Arial">Open attendance dashboard</a></p>'
        '<p style="margin-top:18px;font:11px Arial;color:#64748b">Automatic previous-day report. Times are shown in India Standard Time.</p>'
        "</div></div></div>"
    )


async def _claim_delivery(company_id: str, report_date: str) -> tuple[str, str] | None:
    delivery_id = f"attendance-report:{company_id}:{report_date}"
    now = datetime.now(timezone.utc)
    existing = await db.attendance_report_deliveries.find_one({"id": delivery_id})
    if existing and existing.get("status") == "sent":
        return None
    if existing and existing.get("status") == "sending" and existing.get("lease_until", now) > now:
        return None
    lease = str(uuid4())
    values = {
        "id": delivery_id,
        "company_id": company_id,
        "report_date": report_date,
        "status": "sending",
        "lease": lease,
        "lease_until": now + timedelta(minutes=30),
        "updated_at": now,
    }
    if not existing:
        values["created_at"] = now
        try:
            await db.attendance_report_deliveries.insert_one(values)
        except DuplicateKeyError:
            return None
    else:
        result = await db.attendance_report_deliveries.update_one(
            {"id": delivery_id, "status": existing.get("status"), "updated_at": existing.get("updated_at")},
            {"$set": values},
        )
        if not result.matched_count:
            return None
    return delivery_id, lease


async def send_company_daily_report(company_id: str, report_date: str) -> str:
    claim = await _claim_delivery(company_id, report_date)
    if not claim:
        return "skipped"
    delivery_id, lease = claim
    try:
        if not email_configured():
            raise RuntimeError("Email delivery is not configured")
        report = await daily_attendance_report_data(company_id, report_date)
        cfg = await get_email_settings()
        day_label = date.fromisoformat(report_date).strftime("%d %b %Y")
        email_id = await send_email(
            f"Attendance Report — {report['company_name']} — {day_label}",
            daily_report_email_html(report),
            cfg["sender"],
            cfg["recipients"],
        )
        now = datetime.now(timezone.utc)
        await db.attendance_report_deliveries.update_one(
            {"id": delivery_id, "lease": lease},
            {"$set": {
                "status": "sent", "sent_at": now, "updated_at": now, "email_id": email_id,
                "recipient_count": len(cfg["recipients"]), "detail": "Sent at 8:00 AM IST schedule",
            }, "$unset": {"lease": "", "lease_until": ""}},
        )
        logger.info("daily attendance report sent: %s %s", report["company_name"], report_date)
        return "sent"
    except Exception as exc:
        now = datetime.now(timezone.utc)
        await db.attendance_report_deliveries.update_one(
            {"id": delivery_id, "lease": lease},
            {"$set": {"status": "failed", "updated_at": now, "detail": str(exc)[:300]}, "$unset": {"lease": "", "lease_until": ""}},
        )
        logger.error("daily attendance report failed (%s, %s): %s", company_id, report_date, exc)
        return "failed"


async def send_previous_day_attendance_reports(now: datetime | None = None) -> dict[str, int | str]:
    local_now = (now or datetime.now(timezone.utc)).astimezone(INDIA)
    report_date = (local_now.date() - timedelta(days=1)).isoformat()
    companies = await db.clients.find(
        {"archived": {"$ne": True}}, {"_id": 0, "id": 1},
    ).sort("sort_order", 1).to_list(500)
    summary: dict[str, int | str] = {"report_date": report_date, "sent": 0, "skipped": 0, "failed": 0}
    for company in companies:
        result = await send_company_daily_report(company["id"], report_date)
        summary[result] = int(summary[result]) + 1
    return summary


async def attendance_report_scheduler() -> None:
    """Run inside the existing paid web service; persistent delivery records prevent duplicates."""
    await asyncio.sleep(10)
    while True:
        now = datetime.now(INDIA)
        failed = 0
        try:
            if now.time() >= REPORT_TIME:
                summary = await send_previous_day_attendance_reports(now)
                failed = int(summary["failed"])
                logger.info("daily attendance report cycle: %s", summary)
        except asyncio.CancelledError:
            raise
        except Exception:
            failed = 1
            logger.exception("daily attendance report scheduler cycle failed")
        if failed and now.time() < time(hour=12):
            delay = 15 * 60
        else:
            next_run_date = now.date() if now.time() < REPORT_TIME else now.date() + timedelta(days=1)
            next_run = datetime.combine(next_run_date, REPORT_TIME, tzinfo=INDIA)
            delay = max(60, (next_run - now).total_seconds())
        await asyncio.sleep(delay)

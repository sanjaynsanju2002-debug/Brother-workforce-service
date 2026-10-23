"""Minimal staff activity history: identities and record paths, never request bodies."""
import logging
from datetime import datetime, timezone
from uuid import uuid4
from lib import auth


async def log_admin_change(request, status_code):
    principal = getattr(request.state, "admin", None)
    path = request.url.path
    if not principal or request.method not in {"POST", "PUT", "PATCH", "DELETE"} or not 200 <= status_code < 300 or not path.startswith("/api/admin/"):
        return
    if path.endswith(("/preview", "/inspect")) or path in {"/api/admin/me", "/api/admin/logout"}:
        return
    action = {"POST": "Create / action", "PUT": "Save", "PATCH": "Update", "DELETE": "Delete"}[request.method]
    record_id = str(uuid4())
    try:
        await auth.db.audit_events.insert_one({"_id": record_id, "id": record_id, "at": datetime.now(timezone.utc).isoformat(),
            "actor": principal["name"], "actor_id": principal.get("user_id"), "role": principal["role"],
            "subject": getattr(request.state, "audit_subject", ""), "method": request.method, "path": path.removeprefix("/api/admin/"), "action": action})
    except Exception:
        logging.getLogger(__name__).exception("Could not save the staff activity event")

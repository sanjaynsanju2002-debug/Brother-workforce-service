import asyncio
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
from lib.db import client, db, ensure_indexes


# Startup runs before the yield, shutdown after it. Add your own setup/teardown here.
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.database_ready = False
    await ensure_indexes()
    app.state.database_ready = True
    from lib.attendance_report_email import attendance_report_scheduler
    report_scheduler_enabled = os.environ.get("ATTENDANCE_REPORT_SCHEDULER_ENABLED", "true").lower() not in {"0", "false", "no"}
    app.state.attendance_report_task = asyncio.create_task(attendance_report_scheduler()) if report_scheduler_enabled else None
    yield
    if app.state.attendance_report_task:
        app.state.attendance_report_task.cancel()
        with suppress(asyncio.CancelledError):
            await app.state.attendance_report_task
    client.close()


# Create the main app without a prefix
app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def response_headers(request, call_next):
    response = await call_next(request)
    from lib.audit import log_admin_change
    await log_admin_change(request, response.status_code)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if request.url.path == "/admin" or request.url.path.startswith(("/admin/", "/api/admin/", "/api/employee-attendance", "/api/workers")):
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
        response.headers.setdefault("Cache-Control", "private, no-store")
    return response

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


@api_router.get("/health/live", include_in_schema=False)
async def liveness():
    return {"status": "alive"}


@api_router.get("/health/ready", include_in_schema=False)
async def readiness():
    from fastapi.responses import JSONResponse
    try:
        if not getattr(app.state, "database_ready", False):
            raise RuntimeError("not ready")
        await asyncio.wait_for(db.command("ping"), timeout=2)
    except Exception:
        return JSONResponse({"status": "unavailable"}, status_code=503, headers={"Cache-Control": "no-store"})
    return JSONResponse({"status": "ready"}, headers={"Cache-Control": "no-store"})


from routers.public import router as public_router  # noqa: E402
from routers.admin import router as admin_router  # noqa: E402
from routers.auth_admin import router as auth_admin_router  # noqa: E402
from routers.email_admin import router as email_router  # noqa: E402
from routers.clients import router as clients_router  # noqa: E402
from routers.assignments import router as assignments_router  # noqa: E402
from routers.cron import router as cron_router  # noqa: E402
from routers.talent import router as talent_router  # noqa: E402
from routers.invoices import router as invoices_router  # noqa: E402
from routers.expenses import router as expenses_router  # noqa: E402
from routers.finance import router as finance_router  # noqa: E402
from routers.service_info import router as service_info_router
from routers.team import router as team_router
from routers.backups import router as backups_router
from routers.payroll import router as payroll_router  # noqa: E402
from routers.operations import router as operations_router
from routers.employee_attendance import router as employee_attendance_router, admin_router as employee_attendance_admin_router
from routers.payments import router as payments_router

admin_router.include_router(email_router)
api_router.include_router(public_router)
api_router.include_router(auth_admin_router)
api_router.include_router(admin_router)
api_router.include_router(talent_router)
api_router.include_router(invoices_router)
api_router.include_router(expenses_router)
api_router.include_router(finance_router)
api_router.include_router(payroll_router)
api_router.include_router(operations_router)
api_router.include_router(employee_attendance_router)
api_router.include_router(employee_attendance_admin_router)
api_router.include_router(payments_router)
api_router.include_router(service_info_router)
from routers.system_admin import router as system_router
api_router.include_router(system_router)
from routers.journey import router as journey_router
api_router.include_router(journey_router)
api_router.include_router(team_router)
api_router.include_router(backups_router)
api_router.include_router(clients_router)
api_router.include_router(assignments_router)
api_router.include_router(cron_router)

# Include the router in the main app
app.include_router(api_router)

cors_origins = os.environ.get(
    'CORS_ORIGINS',
    'https://brothersworkforcesolutions.in,https://brother-workforce-service.onrender.com',
).split(',')
attendance_origin = os.environ.get('ATTENDANCE_APP_ORIGIN', '').strip().rstrip('/')
if attendance_origin and attendance_origin not in cors_origins:
    cors_origins.append(attendance_origin)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
from lib.frontend import mount_frontend

mount_frontend(app, ROOT_DIR.parent / "frontend" / "dist")

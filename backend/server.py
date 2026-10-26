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
from lib.workforce import reconcile_companies, reconcile_workforce
from lib.job_translations import translate_known_job
from lib.job_descriptions import fill_missing_job_descriptions


# Startup runs before the yield, shutdown after it. Add your own setup/teardown here.
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.index_task = asyncio.create_task(ensure_indexes())  # background: a big index build must not block boot
    # Correct the existing public post without changing its role or pay range.
    await db.jobs.update_many({"title": "Telicaller"}, {"$set": {"title": "Telecaller"}})
    await db.jobs.update_many({"salary": "20,000-25000"}, {"$set": {"salary": "₹20,000–₹25,000"}})
    # Add only details the owner already supplied for the Telecaller role. Do not
    # overwrite a fuller description entered by an administrator later.
    await db.jobs.update_many(
        {"title": "Telecaller", "location": "Mysore", "salary": "₹20,000–₹25,000", "shift": "General shift", "$or": [{"description": None}, {"description": ""}]},
        {"$set": {
            "description": "Qualification: Any degree.\nRequired skill: Good speaking English.\nSalary: ₹20,000–₹25,000.\nLocation: Mysore.\nShift: General shift.",
            "description_kn": "ವಿದ್ಯಾರ್ಹತೆ: ಯಾವುದೇ ಪದವಿ.\nಅಗತ್ಯ ಕೌಶಲ್ಯ: ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ಚೆನ್ನಾಗಿ ಮಾತನಾಡುವ ಸಾಮರ್ಥ್ಯ.\nಸಂಬಳ: ₹20,000–₹25,000.\nಸ್ಥಳ: ಮೈಸೂರು.\nಪಾಳಿ: ಸಾಮಾನ್ಯ ಪಾಳಿ.",
            "updated_at": datetime.now(timezone.utc),
        }},
    )
    # Older installs seeded illustrative industry cards as public "clients".
    # Hide only untouched samples; retain any card that an admin has enriched.
    sample_clients = [
        ("Auto Component Manufacturer", "Nanjangud Industrial Area"),
        ("Precision Engineering Works", "Hebbal Industrial Estate"),
        ("FMCG Packaging Unit", "Belagola Industrial Area"),
        ("Logistics & Warehousing Hub", "Kadakola Industrial Corridor"),
        ("Your Company Could Be Here", "Mysore & across Karnataka"),
    ]
    await db.clients.update_many(
        {
            "$or": [{"name": name, "location": location} for name, location in sample_clients],
            "logo_filename": None,
            "headcount": {"$in": [None, ""]},
            "service_summary": {"$in": [None, ""]},
            "outcome": {"$in": [None, ""]},
        },
        {"$set": {"visible": False}},
    )
    # Migration is retryable: deterministic IDs and name+phone matching prevent duplicates.
    try:
        descriptions = await fill_missing_job_descriptions(db)
        logging.getLogger(__name__).info("Job descriptions completed: %s", descriptions)
    except Exception:
        logging.getLogger(__name__).exception("Job descriptions will retry on next startup")
    try:
        await translate_known_job(db)
        await reconcile_companies(db)
        result = await reconcile_workforce(db)
        logging.getLogger(__name__).info("Workforce reconciliation: %s", result)
    except Exception:
        logging.getLogger(__name__).exception("Workforce reconciliation will retry on next startup")
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
app = FastAPI(lifespan=lifespan)


@app.middleware("http")
async def response_headers(request, call_next):
    response = await call_next(request)
    from lib.audit import log_admin_change
    await log_admin_change(request, response.status_code)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if request.url.path == "/admin" or request.url.path.startswith(("/admin/", "/api/admin/", "/api/employee-attendance")):
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
        response.headers.setdefault("Cache-Control", "private, no-store")
    return response

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.model_dump())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

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

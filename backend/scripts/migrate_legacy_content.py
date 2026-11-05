"""Explicit legacy repair. Back up first; never run as part of ordinary startup."""
import asyncio
from datetime import datetime, timezone
import logging
from lib.db import db, client
from lib.workforce import reconcile_companies, reconcile_workforce
from lib.job_translations import translate_known_job
from lib.job_descriptions import fill_missing_job_descriptions

async def main():
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
        logging.getLogger(__name__).exception("Job descriptions repair failed; review before manually retrying")
    try:
        await translate_known_job(db)
        await reconcile_companies(db)
        result = await reconcile_workforce(db)
        logging.getLogger(__name__).info("Workforce reconciliation: %s", result)
    except Exception:
        logging.getLogger(__name__).exception("Workforce reconciliation repair failed; review before manually retrying")
    client.close()

if __name__ == "__main__":
    raise SystemExit("Run only after reviewing the legacy data repair: import asyncio; from scripts.migrate_legacy_content import main; asyncio.run(main())")

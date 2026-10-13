"""Seed hidden example cards for admins learning the client manager.

Idempotent: matches on name and does not overwrite an edited profile.
Illustrative names must not appear on the public site as real clients.

Run: cd /app/backend && python seed_clients.py
"""

import asyncio

from lib.db import db, ensure_indexes
from models.clients import Client

SECTORS = [
    {"name": "Auto Component Manufacturer", "industry": "Automobile", "location": "Nanjangud Industrial Area"},
    {"name": "Precision Engineering Works", "industry": "Engineering", "location": "Hebbal Industrial Estate"},
    {"name": "FMCG Packaging Unit", "industry": "FMCG & Packaging", "location": "Belagola Industrial Area"},
    {"name": "Logistics & Warehousing Hub", "industry": "Warehouse & Logistics", "location": "Kadakola Industrial Corridor"},
    {"name": "Your Company Could Be Here", "industry": "Any sector", "location": "Mysore & across Karnataka"},
]


async def main() -> None:
    await ensure_indexes()
    for order, sector in enumerate(SECTORS):
        existing = await db.clients.find_one({"name": sector["name"]})
        if existing:
            print(f"kept existing: {sector['name']}")
        else:
            client = Client(**sector, sort_order=order, visible=False)
            await db.clients.insert_one(client.model_dump())
            print(f"inserted: {sector['name']}")
    print("total clients:", await db.clients.count_documents({}))


if __name__ == "__main__":
    asyncio.run(main())

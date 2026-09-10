"""Seed the generic sector cards for the "Businesses We Support" section.

Idempotent: matches on name, so re-running updates instead of duplicating.
Headcount is deliberately left blank — fill in real deployment numbers from the admin
Clients tab rather than publishing invented figures.

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
            await db.clients.update_one(
                {"name": sector["name"]},
                {"$set": {**sector, "sort_order": order, "visible": True}},
            )
            print(f"updated: {sector['name']}")
        else:
            client = Client(**sector, sort_order=order, visible=True)
            await db.clients.insert_one(client.model_dump())
            print(f"inserted: {sector['name']}")
    print("total clients:", await db.clients.count_documents({}))


if __name__ == "__main__":
    asyncio.run(main())

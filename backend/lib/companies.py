"""Shared company identity with compatibility for older invoice customers."""

import re
from datetime import datetime, timezone

from lib.invoices import InvoiceCompany


def company_name_query(name: str) -> dict:
    pattern = r"^\s*" + r"\s+".join(re.escape(part) for part in name.split()) + r"\s*$"
    return {"name": {"$regex": pattern, "$options": "i"}}


def company_name_key(name: str) -> str:
    return " ".join(name.casefold().split())


def invoice_company(client: dict | None, billing: dict | None = None) -> InvoiceCompany:
    company = client or billing
    return InvoiceCompany(
        id=(billing or company)["id"], name=company["name"],
        address=(client or {}).get("billing_address") if (client or {}).get("billing_address") is not None else ((billing or {}).get("address") or (client or {}).get("location") or ""),
        gstin=(client or {}).get("gstin") if (client or {}).get("gstin") is not None else ((billing or {}).get("gstin") or ""),
        created_at=company.get("created_at") or datetime.now(timezone.utc),
    )

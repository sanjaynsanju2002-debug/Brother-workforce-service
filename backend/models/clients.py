"""Client companies shown in the "Businesses We Support" section.

Admin-managed: name, industry, location, headcount note, approved service
details and outcomes, optional logo, visibility flag.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field, field_validator


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid() -> str:
    return str(uuid.uuid4())


class ClientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    industry: Optional[str] = None
    location: Optional[str] = None
    billing_address: Optional[str] = Field(default=None, max_length=2000)
    gstin: Optional[str] = Field(default=None, max_length=30)
    headcount: Optional[str] = None
    service_summary: Optional[str] = None
    outcome: Optional[str] = None
    visible: bool = True

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Enter a company name")
        return value.strip()


class Client(ClientCreate):
    id: str = Field(default_factory=_uid)
    archived: bool = False
    logo_filename: Optional[str] = None
    sort_order: int = 0
    created_at: datetime = Field(default_factory=_now)


class ClientUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    industry: Optional[str] = None
    location: Optional[str] = None
    billing_address: Optional[str] = Field(default=None, max_length=2000)
    gstin: Optional[str] = Field(default=None, max_length=30)
    headcount: Optional[str] = None
    service_summary: Optional[str] = None
    outcome: Optional[str] = None
    visible: Optional[bool] = None
    sort_order: Optional[int] = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not value.strip():
            raise ValueError("Enter a company name")
        return value.strip() if value is not None else None


class PublicClient(BaseModel):
    id: str
    name: str
    industry: Optional[str] = None
    location: Optional[str] = None
    headcount: Optional[str] = None
    service_summary: Optional[str] = None
    outcome: Optional[str] = None
    logo_filename: Optional[str] = None
    visible: bool = True
    sort_order: int = 0
    created_at: datetime

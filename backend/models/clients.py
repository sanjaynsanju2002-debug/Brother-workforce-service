"""Client companies shown in the "Businesses We Support" section.

Admin-managed: name, industry, location, headcount note, optional logo, visibility flag.
When no visible clients exist the frontend falls back to placeholder cards, so the public
site never looks broken.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid() -> str:
    return str(uuid.uuid4())


class ClientCreate(BaseModel):
    name: str
    industry: Optional[str] = None
    location: Optional[str] = None
    headcount: Optional[str] = None
    visible: bool = True


class Client(ClientCreate):
    id: str = Field(default_factory=_uid)
    logo_filename: Optional[str] = None
    sort_order: int = 0
    created_at: datetime = Field(default_factory=_now)


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    industry: Optional[str] = None
    location: Optional[str] = None
    headcount: Optional[str] = None
    visible: Optional[bool] = None
    sort_order: Optional[int] = None

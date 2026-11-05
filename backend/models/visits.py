"""Website visit tracking — anonymous counts only, no IPs or personal data stored."""

import uuid
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field


class VisitCreate(BaseModel):
    path: Optional[str] = Field(default=None, max_length=160, pattern=r"^/(?:jobs/[A-Za-z0-9-]{1,80})?$")


class Visit(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    path: Optional[str] = Field(default=None, max_length=160, pattern=r"^/(?:jobs/[A-Za-z0-9-]{1,80})?$")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TrafficStats(BaseModel):
    visits_total: int
    visits_today: int
    visits_week: int
    workers_total: int
    workers_today: int
    requests_total: int
    requests_today: int

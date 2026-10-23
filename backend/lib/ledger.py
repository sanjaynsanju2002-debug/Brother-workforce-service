"""Payment records stored atomically with their invoice or payroll snapshot."""
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Annotated, Literal
from zoneinfo import ZoneInfo
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator, field_validator

LedgerAmount = Annotated[Decimal, Field(ge=0, le=100_000_000_000_000, decimal_places=2, allow_inf_nan=False)]


def today():
    return datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()


def amount(value):
    return Decimal(str(value or "0"))


def money(value):
    return f"{amount(value):.2f}"


class PaymentInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    request_id: str = Field(pattern=r"^[0-9a-fA-F-]{36}$")
    revision: int = Field(ge=1)
    amount: LedgerAmount
    payment_date: date
    method: Literal["Bank", "UPI", "Cash", "Other"] = "Bank"
    reference: str = Field(default="", max_length=150)
    notes: str = Field(default="", max_length=500)

    @field_validator("request_id")
    @classmethod
    def canonical_id(cls, value):
        return str(UUID(value))

    @model_validator(mode="after")
    def valid_payment(self):
        if self.amount <= 0:
            raise ValueError("Enter a payment amount greater than zero")
        if self.payment_date.isoformat() > today():
            raise ValueError("A recorded payment cannot have a future date")
        return self


class Payment(BaseModel):
    id: str
    amount: LedgerAmount
    payment_date: str
    method: str
    reference: str = ""
    notes: str = ""
    by: str
    created_at: datetime
    assignment_id: str | None = None
    kind: Literal["Salary", "Advance"] | None = None
    voided_at: datetime | None = None
    voided_by: str | None = None
    void_reason: str | None = None


def received(invoice):
    opening = invoice.get("opening_paid_amount")
    if opening is None:
        opening = invoice["totals"]["total"] if invoice.get("payment_status") == "Paid" else "0"
    return amount(opening) + sum((amount(p["amount"]) for p in invoice.get("payments", []) if not p.get("voided_at")), Decimal("0"))


def salary_paid(payroll, assignment_id=None):
    return sum((amount(p["amount"]) for p in payroll.get("salary_payments", [])
                if not p.get("voided_at") and (assignment_id is None or p.get("assignment_id") == assignment_id)), Decimal("0"))


def payment_state(total, paid):
    return "Paid" if paid >= amount(total) else "Partially Paid" if paid > 0 else "Pending"


def payment_record(payload, actor):
    return {"id": payload.request_id, **payload.model_dump(mode="json", exclude={"request_id", "revision"}),
            "by": actor, "created_at": datetime.now(timezone.utc).isoformat()}

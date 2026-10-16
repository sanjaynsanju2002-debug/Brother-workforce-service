"""Invoice inputs and the single calculation used by preview, storage and exports."""

from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from lib.months import MONTH_PATTERN, month_label, parse_billing_period

Money = Annotated[Decimal, Field(ge=0, le=1_000_000_000, decimal_places=2, allow_inf_nan=False)]
Quantity = Annotated[Decimal, Field(ge=0, le=1_000_000, decimal_places=2, allow_inf_nan=False)]
Percentage = Annotated[Decimal, Field(ge=0, le=100, decimal_places=2, allow_inf_nan=False)]
LineKey = Literal["skilled_men", "skilled_women", "semi_men", "semi_women", "unskilled_men", "unskilled_women", "overtime", "other"]
LINE_LABELS = {
    "skilled_men": ("Skilled", "Men"),
    "skilled_women": ("Skilled", "Women"),
    "semi_men": ("Semi-skilled", "Men"),
    "semi_women": ("Semi-skilled", "Women"),
    "unskilled_men": ("Unskilled", "Men"),
    "unskilled_women": ("Unskilled", "Women"),
    "overtime": ("Overtime / additional work", "N/A"),
    "other": ("Other charges", "N/A"),
}


class InvoiceModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    @field_validator("*")
    @classmethod
    def printable_text(cls, value):
        if isinstance(value, str) and any(
            not (char in "\t\n\r" or 32 <= ord(char) <= 0xD7FF or 0xE000 <= ord(char) <= 0xFFFD or 0x10000 <= ord(char) <= 0x10FFFF)
            for char in value
        ):
            raise ValueError("Remove unsupported control characters from the text")
        return value


class InvoiceProfile(InvoiceModel):
    name: str = Field(default="Brothers Workforce Solutions", min_length=1, max_length=150)
    address: str = Field(default="1, Boregowda Complex, Belavadi Main Rd, Near Canara Bank, Krishnappa Block, Mysore, Karnataka - 570018", max_length=500)
    phone: str = Field(default="+91 96063 33542", max_length=40)
    email: str = Field(default="brothersworkforcesolutions@gmail.com", max_length=150)
    website: str = Field(default="brothersworkforcesolutions.in", max_length=150)
    gstin: str = Field(default="29EQOPR8753K1ZM", max_length=30)
    payment_details: str = Field(default="", max_length=800)


class InvoiceCompanyInput(InvoiceModel):
    name: str = Field(min_length=1, max_length=150)
    address: str = Field(default="", max_length=500)
    gstin: str = Field(default="", max_length=30)


class InvoiceCompany(InvoiceCompanyInput):
    id: str
    created_at: datetime


class InvoiceLine(InvoiceModel):
    key: LineKey
    quantity: Quantity = Decimal("0")
    rate: Money = Decimal("0")

    @model_validator(mode="after")
    def whole_people(self):
        if self.key not in ("overtime", "other") and self.quantity != self.quantity.to_integral_value():
            raise ValueError("Worker quantities must be whole numbers")
        return self


def default_lines():
    return [InvoiceLine(key=key) for key in LINE_LABELS]


class InvoiceInput(InvoiceModel):
    # Keep the bill-to snapshot even if a company record changes in the future.
    # Older saved invoices have no company reference and remain readable.
    company_id: UUID | None = None
    client_name: str = Field(default="", max_length=150)
    client_address: str = Field(default="", max_length=500)
    client_gstin: str = Field(default="", max_length=30)
    invoice_date: date
    due_date: date | None = None
    service_month: str | None = Field(default=None, pattern=MONTH_PATTERN)
    billing_period: str = Field(default="", max_length=100)
    supplier: InvoiceProfile = Field(default_factory=InvoiceProfile)
    lines: list[InvoiceLine] = Field(default_factory=default_lines, min_length=8, max_length=8)
    service_percentage: Percentage = Decimal("0")
    cgst_percentage: Percentage | None = None
    sgst_percentage: Percentage | None = None
    # Retain the recorded amount on invoices saved before percentage GST existed.
    gst_amount: Money = Decimal("0")
    notes: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def complete_lines(self):
        if {line.key for line in self.lines} != set(LINE_LABELS):
            raise ValueError("Include each invoice charge row exactly once")
        if self.due_date is not None and self.due_date < self.invoice_date:
            raise ValueError("Payment due date cannot be before the invoice date")
        if self.service_month is None:
            self.service_month = parse_billing_period(self.billing_period)
        if self.service_month and not self.billing_period:
            self.billing_period = month_label(self.service_month)
        # A stable order keeps saved invoices and both exports aligned with the template.
        self.lines.sort(key=lambda line: list(LINE_LABELS).index(line.key))
        if self.uses_gst_percentages:
            self.cgst_percentage = self.cgst_percentage if self.cgst_percentage is not None else Decimal("0")
            self.sgst_percentage = self.sgst_percentage if self.sgst_percentage is not None else Decimal("0")
            self.gst_amount = Decimal("0")
        return self

    @property
    def uses_gst_percentages(self) -> bool:
        return self.cgst_percentage is not None or self.sgst_percentage is not None


class InvoiceTotals(InvoiceModel):
    line_amounts: dict[str, Decimal]
    base_amount: Decimal
    service_charge: Decimal
    subtotal: Decimal
    cgst_amount: Decimal = Decimal("0")
    sgst_amount: Decimal = Decimal("0")
    gst_amount: Decimal
    total: Decimal


class Invoice(InvoiceInput):
    id: str
    invoice_number: str
    revision: int
    created_at: datetime
    updated_at: datetime
    totals: InvoiceTotals
    payment_status: Literal["Pending", "Paid"] = "Pending"


def round_money(amount: Decimal) -> Decimal:
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def calculate_invoice(invoice: InvoiceInput) -> InvoiceTotals:
    amounts = {line.key: round_money(line.quantity * line.rate) for line in invoice.lines}
    base = sum(amounts.values(), Decimal("0.00"))
    service = round_money(base * invoice.service_percentage / Decimal("100"))
    subtotal = base + service
    cgst = round_money(subtotal * (invoice.cgst_percentage or Decimal("0")) / Decimal("100"))
    sgst = round_money(subtotal * (invoice.sgst_percentage or Decimal("0")) / Decimal("100"))
    gst = cgst + sgst if invoice.uses_gst_percentages else invoice.gst_amount
    return InvoiceTotals(
        line_amounts=amounts, base_amount=base, service_charge=service,
        subtotal=subtotal, cgst_amount=cgst, sgst_amount=sgst, gst_amount=gst,
        total=subtotal + gst,
    )

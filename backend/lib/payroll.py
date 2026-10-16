"""Company payroll inputs, saved employee snapshots and decimal calculations."""

import calendar
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator

from lib.invoices import InvoiceModel, InvoiceProfile, Money, Percentage, round_money
from lib.months import MONTH_PATTERN

Amount = Annotated[Decimal, Field(ge=0, le=100_000_000_000_000, decimal_places=2, allow_inf_nan=False)]
WorkedDays = Annotated[Decimal, Field(ge=0, le=31, decimal_places=2, allow_inf_nan=False)]
MAX_EMPLOYEES = 2000


def line_amounts(days: Decimal, rate: Decimal, esi_rate: Decimal, pf_rate: Decimal):
    gross = round_money(days * rate)
    esi = round_money(gross * esi_rate / Decimal("100"))
    pf = round_money(gross * pf_rate / Decimal("100"))
    if esi + pf > gross:
        raise ValueError("ESI and PF deductions cannot exceed gross wages")
    return gross, esi, pf, gross - esi - pf


class PayrollLineInput(InvoiceModel):
    assignment_id: str = Field(min_length=1, max_length=80)
    worked_days: WorkedDays = Decimal("0.00")
    daily_rate: Money = Decimal("0.00")
    esi_percentage: Percentage = Decimal("0.00")
    pf_percentage: Percentage = Decimal("0.00")

    @field_validator("worked_days", "daily_rate", "esi_percentage", "pf_percentage")
    @classmethod
    def two_places(cls, value: Decimal) -> Decimal:
        return round_money(value)

    @model_validator(mode="after")
    def valid_deductions(self):
        if self.esi_percentage + self.pf_percentage > 100:
            raise ValueError("Combined ESI and PF percentages cannot exceed 100%")
        line_amounts(self.worked_days, self.daily_rate, self.esi_percentage, self.pf_percentage)
        return self


class PayrollInput(InvoiceModel):
    company_id: str = Field(min_length=1, max_length=80)
    month: str = Field(pattern=MONTH_PATTERN)
    lines: list[PayrollLineInput] = Field(default_factory=list, max_length=MAX_EMPLOYEES)
    notes: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def valid_attendance(self):
        if len({line.assignment_id for line in self.lines}) != len(self.lines):
            raise ValueError("Include each employee only once in payroll")
        days = calendar.monthrange(int(self.month[:4]), int(self.month[5:]))[1]
        if any(line.worked_days > days for line in self.lines):
            raise ValueError(f"Worked days cannot exceed {days} for this month")
        return self


class PayrollSave(PayrollInput):
    revision: int | None = Field(default=None, ge=1)


class PayrollEmployee(InvoiceModel):
    assignment_id: str
    employee_id: str | None = None
    full_name: str = Field(min_length=1, max_length=150)
    role: str | None = Field(default=None, max_length=150)
    salary: Money | None = None
    salary_basis: Literal["Monthly", "Daily"] = "Monthly"
    status: Literal["Active", "Completed"] = "Active"


class PayrollLine(PayrollLineInput, PayrollEmployee):
    gross_wages: Amount
    esi_deduction: Amount
    pf_deduction: Amount
    payable: Amount


class PayrollLineTotals(InvoiceModel):
    assignment_id: str
    gross_wages: Amount
    esi_deduction: Amount
    pf_deduction: Amount
    payable: Amount


class PayrollTotals(InvoiceModel):
    employee_count: int
    worked_days: Amount
    gross_wages: Amount
    esi_deduction: Amount
    pf_deduction: Amount
    payable: Amount


class Payroll(InvoiceModel):
    id: str
    company_id: str
    company_name: str = Field(min_length=1, max_length=500)
    company_location: str = Field(default="", max_length=500)
    month: str = Field(pattern=MONTH_PATTERN)
    supplier: InvoiceProfile
    lines: list[PayrollLine] = Field(max_length=MAX_EMPLOYEES)
    notes: str = ""
    totals: PayrollTotals
    revision: int
    created_at: datetime
    updated_at: datetime


def calculate_payroll(value: PayrollInput) -> tuple[list[PayrollLineTotals], PayrollTotals]:
    rows = []
    for line in value.lines:
        gross, esi, pf, payable = line_amounts(line.worked_days, line.daily_rate, line.esi_percentage, line.pf_percentage)
        rows.append(PayrollLineTotals(assignment_id=line.assignment_id, gross_wages=gross, esi_deduction=esi, pf_deduction=pf, payable=payable))
    zero = Decimal("0.00")
    return rows, PayrollTotals(
        employee_count=len(rows), worked_days=sum((line.worked_days for line in value.lines), zero),
        gross_wages=sum((row.gross_wages for row in rows), zero),
        esi_deduction=sum((row.esi_deduction for row in rows), zero),
        pf_deduction=sum((row.pf_deduction for row in rows), zero),
        payable=sum((row.payable for row in rows), zero),
    )

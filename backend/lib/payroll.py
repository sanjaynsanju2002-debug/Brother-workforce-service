"""Company payroll inputs, saved employee snapshots and decimal calculations."""

import calendar
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, field_validator, model_validator

from lib.invoices import InvoiceModel, InvoiceProfile, Money, Percentage, round_money
from lib.months import MONTH_PATTERN
from lib.ledger import Payment

Amount = Annotated[Decimal, Field(ge=0, le=100_000_000_000_000, decimal_places=2, allow_inf_nan=False)]
WorkedDays = Annotated[Decimal, Field(ge=0, le=31, decimal_places=2, allow_inf_nan=False)]
MAX_EMPLOYEES = 2000
HOURS_PER_DAY = Decimal("9")


def line_amounts(days: Decimal, rate: Decimal, esi_rate: Decimal, pf_rate: Decimal, overtime_hours=Decimal("0"), overtime_rate=Decimal("0")):
    gross = round_money(days * rate + overtime_hours * overtime_rate)
    esi = round_money(gross * esi_rate / Decimal("100"))
    pf = round_money(gross * pf_rate / Decimal("100"))
    if esi + pf > gross:
        raise ValueError("ESI and PF deductions cannot exceed gross wages")
    return gross, esi, pf, gross - esi - pf


def sunday_count(month: str) -> int:
    year, number = int(month[:4]), int(month[5:])
    return sum(
        1
        for day in range(1, calendar.monthrange(year, number)[1] + 1)
        if calendar.weekday(year, number, day) == calendar.SUNDAY
    )


class PayrollLineInput(InvoiceModel):
    assignment_id: str = Field(min_length=1, max_length=80)
    calculation_method: Literal["Daily", "Monthly"] = "Daily"
    worked_days: WorkedDays = Decimal("0.00")
    daily_rate: Money = Decimal("0.00")
    base_salary: Money = Decimal("0.00")
    days_absent: WorkedDays = Decimal("0.00")
    credit_leave: WorkedDays = Decimal("0.00")
    government_holidays: WorkedDays = Decimal("0.00")
    salary_advance: Money = Decimal("0.00")
    penalty: Money = Decimal("0.00")
    allowance: Money = Decimal("0.00")
    overtime_hours: Annotated[Decimal, Field(ge=0, le=744, decimal_places=2, allow_inf_nan=False)] = Decimal("0.00")
    overtime_rate: Money = Decimal("0.00")
    esi_percentage: Percentage = Decimal("0.00")
    esi_employer_percentage: Percentage = Decimal("0.00")
    pf_percentage: Percentage = Decimal("0.00")
    pf_employer_percentage: Percentage = Decimal("0.00")

    @field_validator(
        "worked_days", "daily_rate", "base_salary", "days_absent", "credit_leave", "government_holidays",
        "salary_advance", "penalty", "allowance", "esi_percentage", "esi_employer_percentage",
        "pf_percentage", "pf_employer_percentage", "overtime_hours", "overtime_rate",
    )
    @classmethod
    def two_places(cls, value: Decimal) -> Decimal:
        return round_money(value)

    @model_validator(mode="after")
    def valid_deductions(self):
        if self.esi_percentage + self.pf_percentage > 100:
            raise ValueError("Combined ESI and PF percentages cannot exceed 100%")
        if self.calculation_method == "Daily":
            line_amounts(self.worked_days, self.daily_rate, self.esi_percentage, self.pf_percentage, self.overtime_hours, self.overtime_rate)
        return self


class PayrollInput(InvoiceModel):
    company_id: str = Field(min_length=1, max_length=80)
    month: str = Field(pattern=MONTH_PATTERN)
    lines: list[PayrollLineInput] = Field(default_factory=list, max_length=MAX_EMPLOYEES)
    notes: str = Field(default="", max_length=1000)
    cost_responsibility: Literal["Agency", "Client"] = "Agency"
    attendance_refs: dict[str, int] = Field(default_factory=dict, max_length=31)

    @model_validator(mode="after")
    def valid_attendance(self):
        if len({line.assignment_id for line in self.lines}) != len(self.lines):
            raise ValueError("Include each employee only once in payroll")
        days = calendar.monthrange(int(self.month[:4]), int(self.month[5:]))[1]
        for line in self.lines:
            if any(value > days for value in (line.worked_days, line.days_absent, line.credit_leave, line.government_holidays)):
                raise ValueError(f"Attendance days cannot exceed {days} for this month")
            if line.credit_leave > line.days_absent:
                raise ValueError("Credit leave cannot exceed absent days")
            if line.calculation_method == "Daily":
                if line.worked_days > 0 and line.daily_rate == 0:
                    raise ValueError("Enter a daily rate for every employee with worked days")
                if line.overtime_hours > 0 and line.overtime_rate == 0:
                    raise ValueError("Enter an hourly overtime rate for every daily-wage employee with overtime")
                continue
            if line.base_salary == 0:
                raise ValueError("Enter the monthly salary for every monthly-salary employee")
            per_day = round_money(line.base_salary / Decimal(days))
            loss_of_pay = line.days_absent - line.credit_leave
            if line.base_salary + line.allowance < round_money(per_day * loss_of_pay) + line.salary_advance + line.penalty:
                raise ValueError("Salary deductions cannot exceed salary plus allowance")
        return self


class PayrollSave(PayrollInput):
    revision: int | None = Field(default=None, ge=1)
    created_at: AwareDatetime | None = None


class PayrollEmployee(InvoiceModel):
    assignment_id: str
    employee_id: str | None = None
    full_name: str = Field(min_length=1, max_length=150)
    role: str | None = Field(default=None, max_length=150)
    start_date: str | None = None
    salary: Money | None = None
    salary_basis: Literal["Monthly", "Daily"] = "Monthly"
    status: Literal["Active", "Completed"] = "Active"


class PayrollLine(PayrollLineInput, PayrollEmployee):
    loss_of_pay: Amount = Decimal("0.00")
    sunday_holidays: int = Field(default=0, ge=0, le=6)
    paid_days: Amount = Decimal("0.00")
    per_day_salary: Amount = Decimal("0.00")
    per_hour_salary: Amount = Decimal("0.00")
    leave_deduction: Amount = Decimal("0.00")
    overtime_amount: Amount = Decimal("0.00")
    effective_overtime_rate: Amount = Decimal("0.00")
    gross_wages: Amount
    esi_deduction: Amount
    esi_employer_contribution: Amount = Decimal("0.00")
    pf_deduction: Amount
    pf_employer_contribution: Amount = Decimal("0.00")
    payable: Amount


class PayrollLineTotals(InvoiceModel):
    assignment_id: str
    loss_of_pay: Amount = Decimal("0.00")
    sunday_holidays: int = Field(default=0, ge=0, le=6)
    paid_days: Amount = Decimal("0.00")
    per_day_salary: Amount = Decimal("0.00")
    per_hour_salary: Amount = Decimal("0.00")
    leave_deduction: Amount = Decimal("0.00")
    overtime_amount: Amount = Decimal("0.00")
    effective_overtime_rate: Amount = Decimal("0.00")
    gross_wages: Amount
    esi_deduction: Amount
    esi_employer_contribution: Amount = Decimal("0.00")
    pf_deduction: Amount
    pf_employer_contribution: Amount = Decimal("0.00")
    payable: Amount


class PayrollTotals(InvoiceModel):
    employee_count: int
    worked_days: Amount
    paid_days: Amount = Decimal("0.00")
    leave_deduction: Amount = Decimal("0.00")
    overtime_amount: Amount = Decimal("0.00")
    gross_wages: Amount
    esi_deduction: Amount
    esi_employer_contribution: Amount = Decimal("0.00")
    pf_deduction: Amount
    pf_employer_contribution: Amount = Decimal("0.00")
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
    cost_responsibility: Literal["Agency", "Client"] = "Agency"
    attendance_refs: dict[str, int] = Field(default_factory=dict, max_length=31)
    salary_payments: list[Payment] = Field(default_factory=list, max_length=10000)
    totals: PayrollTotals
    revision: int
    created_at: datetime
    updated_at: datetime


def calculate_payroll(value: PayrollInput) -> tuple[list[PayrollLineTotals], PayrollTotals]:
    rows = []
    month_days = calendar.monthrange(int(value.month[:4]), int(value.month[5:]))[1]
    sundays = sunday_count(value.month)
    for line in value.lines:
        if line.calculation_method == "Monthly":
            sunday_holidays = sundays
            loss_of_pay = line.days_absent - line.credit_leave
            paid_days = line.worked_days + line.credit_leave + line.government_holidays + Decimal(sundays)
            per_day = round_money(line.base_salary / Decimal(month_days))
            per_hour = round_money(per_day / HOURS_PER_DAY)
            leave_deduction = round_money(per_day * loss_of_pay)
            overtime_rate = line.overtime_rate or per_hour
            overtime_amount = round_money(line.overtime_hours * overtime_rate)
            gross = round_money(line.base_salary - leave_deduction - line.salary_advance - line.penalty + line.allowance)
            esi = round_money(gross * line.esi_percentage / Decimal("100"))
            pf = round_money(gross * line.pf_percentage / Decimal("100"))
            esi_employer = round_money(gross * line.esi_employer_percentage / Decimal("100"))
            pf_employer = round_money(gross * line.pf_employer_percentage / Decimal("100"))
            payable = round_money(gross - esi - pf + overtime_amount)
        else:
            sunday_holidays = 0
            gross, esi, pf, payable = line_amounts(line.worked_days, line.daily_rate, line.esi_percentage, line.pf_percentage, line.overtime_hours, line.overtime_rate)
            loss_of_pay = Decimal("0.00")
            paid_days = line.worked_days
            per_day = line.daily_rate
            per_hour = round_money(line.daily_rate / HOURS_PER_DAY) if line.daily_rate else Decimal("0.00")
            leave_deduction = Decimal("0.00")
            overtime_rate = line.overtime_rate
            overtime_amount = round_money(line.overtime_hours * line.overtime_rate)
            esi_employer = round_money(gross * line.esi_employer_percentage / Decimal("100"))
            pf_employer = round_money(gross * line.pf_employer_percentage / Decimal("100"))
        rows.append(PayrollLineTotals(
            assignment_id=line.assignment_id, loss_of_pay=loss_of_pay, sunday_holidays=sunday_holidays,
            paid_days=paid_days, per_day_salary=per_day, per_hour_salary=per_hour,
            leave_deduction=leave_deduction, overtime_amount=overtime_amount,
            effective_overtime_rate=overtime_rate, gross_wages=gross, esi_deduction=esi,
            esi_employer_contribution=esi_employer, pf_deduction=pf,
            pf_employer_contribution=pf_employer, payable=payable,
        ))
    zero = Decimal("0.00")
    return rows, PayrollTotals(
        employee_count=len(rows), worked_days=sum((line.worked_days for line in value.lines), zero),
        paid_days=sum((row.paid_days for row in rows), zero),
        leave_deduction=sum((row.leave_deduction for row in rows), zero),
        overtime_amount=sum((row.overtime_amount for row in rows), zero),
        gross_wages=sum((row.gross_wages for row in rows), zero),
        esi_deduction=sum((row.esi_deduction for row in rows), zero),
        esi_employer_contribution=sum((row.esi_employer_contribution for row in rows), zero),
        pf_deduction=sum((row.pf_deduction for row in rows), zero),
        pf_employer_contribution=sum((row.pf_employer_contribution for row in rows), zero),
        payable=sum((row.payable for row in rows), zero),
    )

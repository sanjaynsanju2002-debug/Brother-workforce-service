"""Explicit service months and unambiguous periods on older invoices."""

import re

MONTH_PATTERN = r"^[1-9][0-9]{3}-(0[1-9]|1[0-2])$"
MONTH_NAMES = ("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December")


def parse_billing_period(value: str | None) -> str | None:
    value = (value or "").strip()
    if re.fullmatch(MONTH_PATTERN, value):
        return value
    parts = re.split(r"[\s/,-]+", value.lower())
    if len(parts) != 2 or not re.fullmatch(r"[1-9][0-9]{3}", parts[1]):
        return None
    names = {name.lower(): i for i, name in enumerate(MONTH_NAMES, 1)}
    names.update({name[:3].lower(): i for i, name in enumerate(MONTH_NAMES, 1)})
    names["sept"] = 9
    number = int(parts[0]) if re.fullmatch(r"0?[1-9]|1[0-2]", parts[0]) else names.get(parts[0])
    return f"{parts[1]}-{number:02d}" if number else None


def service_month(record: dict) -> str | None:
    value = record.get("service_month")
    if value and re.fullmatch(MONTH_PATTERN, value):
        return value
    return parse_billing_period(record.get("billing_period"))


def month_label(month: str) -> str:
    return f"{MONTH_NAMES[int(month[5:]) - 1]} {month[:4]}"

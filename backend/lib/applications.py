"""Validation for new submissions without rejecting older stored records."""
import re
from fastapi import HTTPException


def required_text(value: str, label: str, maximum: int = 150) -> str:
    value = value.strip()
    if not value or len(value) > maximum or any(ord(c) < 32 and c not in '\n\r\t' for c in value):
        raise HTTPException(422, f"Enter a valid {label} (up to {maximum} characters)")
    return value


def indian_mobile(value: str) -> str:
    if re.search(r'[^\d\s+()-]', value):
        raise HTTPException(422, "Enter a valid 10-digit Indian mobile number")
    number = re.sub(r'\D', '', value)
    if len(number) == 12 and number.startswith('91'):
        number = number[2:]
    if not re.fullmatch(r'[6-9]\d{9}', number):
        raise HTTPException(422, "Enter a valid 10-digit Indian mobile number")
    return number


def worker_input(data: dict) -> dict:
    data = dict(data)
    data['full_name'] = required_text(data['full_name'], 'full name')
    data['current_location'] = required_text(data['current_location'], 'location')
    data['mobile'] = indian_mobile(data['mobile'])
    if data.get('whatsapp'):
        data['whatsapp'] = indian_mobile(data['whatsapp'])
    if data.get('skill_category') not in {'Skilled', 'Semi-skilled', 'General Worker'}:
        raise HTTPException(422, 'Select a valid skill category')
    return data


def company_input(data: dict) -> dict:
    data = dict(data)
    for key, label in [('company_name', 'company name'), ('contact_person', 'contact person'), ('company_location', 'company location'), ('job_role', 'job role')]:
        data[key] = required_text(data[key], label)
    data['mobile'] = indian_mobile(data['mobile'])
    count = str(data['worker_count']).strip()
    if not re.fullmatch(r'\d{1,6}', count) or not 1 <= int(count) <= 100000:
        raise HTTPException(422, 'Enter a whole worker count between 1 and 100000')
    data['worker_count'] = str(int(count))
    return data

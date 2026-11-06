"""Executive layout preserves billing data and handles flowing invoice content."""
from decimal import Decimal
from io import BytesIO
import pytest
from pypdf import PdfReader
from lib.invoice_exports import export_pdf
from tests.test_invoice_custom_items import custom_payload
from tests.test_invoices import saved_invoice


@pytest.mark.parametrize('mode', ['managed_services', 'services_only'])
def test_executive_pdf_keeps_business_details_items_totals_and_snapshot(mode):
    data = custom_payload(mode)
    data.update(client_gstin='CLIENT-GST-EXAMPLE', notes='Agreed terms: retain <reference> & original details.',
                supplier={'payment_details':'Account name: Example business\nBank reference: SAMPLE-ONLY'})
    invoice = saved_invoice(data)
    before = invoice.model_dump(mode='json')
    reader = PdfReader(BytesIO(export_pdf(invoice)))
    assert len(reader.pages) == 1
    text = reader.pages[0].extract_text()
    for expected in ['INVOICE', 'BILL TO', 'BILLING PERIOD', 'October 2026', invoice.invoice_number,
                     '16/10/2026', '15/11/2026', 'CLIENT-GST-EXAMPLE', 'PAYMENT DETAILS', 'SAMPLE-ONLY',
                     '<reference> & original details.', 'Packing and dispatch support', f'{invoice.totals.total:,.2f}']:
        assert expected in text
    assert 'DRAFT FOR DESIGN REVIEW' not in text
    assert len(reader.pages[0].images) == 1
    assert invoice.model_dump(mode='json') == before


def test_executive_pdf_flows_very_tall_items_and_long_payment_instructions():
    data = custom_payload()
    data['lines'][0]['description'] = '\n'.join(f'Work line {i}' for i in range(75))
    data['supplier'] = {'payment_details': '\n'.join(f'Instruction {i}' for i in range(45))}
    data['notes'] = '\n'.join(f'Note {i}' for i in range(80))
    invoice = saved_invoice(data)
    reader = PdfReader(BytesIO(export_pdf(invoice)))
    text = ' '.join(page.extract_text() for page in reader.pages)
    assert len(reader.pages) > 1
    for expected in ['Work line 74', 'Instruction 44', 'Note 79', f'{invoice.totals.total:,.2f}', 'Authorised signatory']:
        assert expected in text


def test_executive_pdf_keeps_large_entered_amounts_readable_and_exact():
    data = custom_payload()
    data['lines'][0]['amount'] = '1000000000000000.00'
    invoice = saved_invoice(data)
    text = ' '.join(page.extract_text() for page in PdfReader(BytesIO(export_pdf(invoice))).pages)
    assert f'{Decimal(data["lines"][0]["amount"]):,.2f}' in text
    assert f'{invoice.totals.total:,.2f}' in text

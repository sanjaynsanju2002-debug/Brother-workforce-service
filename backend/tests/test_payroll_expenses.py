"""Automatic expenses follow the saved register without duplicate collection writes."""
from decimal import Decimal
from uuid import uuid4
import httpx
import pytest
from routers import expenses, finance
from server import app
from tests.test_payroll import fake_db, payload
from tests.test_finance import Collection


@pytest.mark.asyncio
async def test_saved_payroll_expenses_follow_edits_retries_responsibility_and_deletion(monkeypatch):
    store = fake_db(monkeypatch)
    for name in ('clients', 'assignments', 'payroll'):
        original = getattr(store, name)
        replacement = Collection()
        replacement.records = original.records
        setattr(store, name, replacement)
    store.expenses, store.invoices = Collection(), Collection()
    monkeypatch.setattr(expenses, 'db', store)
    monkeypatch.setattr(finance, 'db', store)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='https://brothersworkforcesolutions.in') as client:
        await client.post('/api/admin/login', json={'pin': '123456'})
        body = payload()
        body['lines'][0]['esi_employer_percentage'] = '3.25'
        response = await client.post('/api/admin/payroll', json=body)
        assert response.status_code == 200, response.text
        saved = response.json()
        cost = sum(Decimal(saved['totals'].get(k, '0')) for k in ('gross_wages', 'esi_employer_contribution', 'pf_employer_contribution'))
        async def ledger():
            response = await client.get('/api/admin/expenses?month=2026-10')
            assert response.status_code == 200, response.text
            return response.json()
        first = await ledger()
        assert first['total'] == 1 and first['total_amount'] == f'{cost:.2f}'
        entry = first['items'][0]
        assert entry['source'] == 'Payroll' and entry['payroll_id'] == saved['id']
        assert entry['expense_date'] == '2026-10-31' and entry['company_id'] == 'company-a'
        assert entry['amount'] == first['payroll_amount']
        assert (await client.post('/api/admin/payroll', json=body)).json()['id'] == saved['id']
        assert (await ledger())['total'] == 1
        for kind, value in [('Payroll', '500'), ('Operating', '100')]:
            response = await client.post('/api/admin/expenses', data={'request_id': str(uuid4()), 'expense_date': '2026-10-15', 'description': kind, 'amount': value, 'cost_type': kind})
            assert response.status_code == 200
        entries = await ledger()
        report = (await client.get('/api/admin/profit-loss?month=2026-10')).json()
        assert entries['total'] == 3
        assert entries['salary_cash_amount'] == '500.00' and entries['operating_amount'] == '100.00'
        assert entries['total_amount'] == report['expenses'] == f'{cost + 100:.2f}'
        assert report['profit_loss'] == f'{-cost - 100:.2f}'
        body.update(revision=saved['revision'], created_at=saved['created_at'])
        body['lines'][0]['worked_days'] = '20'
        response = await client.post('/api/admin/payroll', json=body)
        assert response.status_code == 200, response.text
        entries = await ledger()
        new_entry = next(e for e in entries['items'] if e['source'] == 'Payroll')
        assert entries['total'] == 3 and new_entry['id'] == entry['id'] and new_entry['revision'] == 2
        assert Decimal(new_entry['amount']) < cost
        assert len(store.expenses.records) == 2
        body.update(revision=2, cost_responsibility='Client')
        response = await client.post('/api/admin/payroll', json=body)
        assert response.status_code == 200, response.text
        assert (await ledger())['payroll_amount'] == '0.00' and (await ledger())['total'] == 2
        assert (await client.get('/api/admin/profit-loss?month=2026-10')).json()['expenses'] == '100.00'
        body.update(revision=3, cost_responsibility='Agency')
        restored = (await client.post('/api/admin/payroll', json=body)).json()
        assert (await ledger())['total'] == 3
        response = await client.delete(f"/api/admin/payroll/{restored['id']}", params={'revision': restored['revision'], 'updated_at': restored['updated_at']})
        assert response.status_code == 204, response.text
        assert (await ledger())['total'] == 2 and (await ledger())['payroll_amount'] == '0.00'
        assert (await client.get('/api/admin/expenses?month=2026-11')).json()['total'] == 0


@pytest.mark.asyncio
async def test_expense_pagination_merges_payroll_with_manual_entries(monkeypatch):
    store = fake_db(monkeypatch)
    for name in ('clients', 'assignments', 'payroll'):
        original = getattr(store, name)
        replacement = Collection()
        replacement.records = original.records
        setattr(store, name, replacement)
    store.expenses, store.invoices = Collection(), Collection()
    monkeypatch.setattr(expenses, 'db', store)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='https://brothersworkforcesolutions.in') as client:
        await client.post('/api/admin/login', json={'pin': '123456'})
        assert (await client.post('/api/admin/payroll', json=payload())).status_code == 200
        for i in range(51):
            await client.post('/api/admin/expenses', data={'request_id': str(uuid4()), 'expense_date': '2026-10-01', 'description': f'Cost {i}', 'amount': '1'})
        first = (await client.get('/api/admin/expenses?month=2026-10')).json()
        second = (await client.get('/api/admin/expenses?month=2026-10&page=2')).json()
        assert first['total'] == second['total'] == 52
        assert len(first['items']) == 50 and len(second['items']) == 2
        assert first['items'][0]['source'] == 'Payroll'
        assert len({e['id'] for e in first['items'] + second['items']}) == 52
        assert first['total_amount'] == second['total_amount']

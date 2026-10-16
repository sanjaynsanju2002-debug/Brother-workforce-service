import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it } from "vitest";
import PayrollEditor from "./PayrollEditor";
import type { PayrollDraft, PayrollInput } from "@/lib/payroll";

it("renders the employee register and the selected employee's editable details with saved totals", () => {
  const people = [
    { assignment_id: "first", employee_id: "0001", full_name: "Ravi Kumar", role: "Operator", salary: "500.00", salary_basis: "Daily" as const, status: "Active" as const },
    { assignment_id: "second", employee_id: "0002", full_name: "Anitha", role: "Packing", salary: "15600.00", salary_basis: "Monthly" as const, status: "Active" as const },
  ];
  const lines = [
    { ...people[0], worked_days: "26.00", daily_rate: "500.00", esi_percentage: "0.75", pf_percentage: "12.00", gross_wages: "13000.00", esi_deduction: "97.50", pf_deduction: "1560.00", payable: "11342.50" },
    { ...people[1], worked_days: "25.50", daily_rate: "600.00", esi_percentage: "0.75", pf_percentage: "12.00", gross_wages: "15300.00", esi_deduction: "114.75", pf_deduction: "1836.00", payable: "13349.25" },
  ];
  const totals = { employee_count: 2, worked_days: "51.50", gross_wages: "28300.00", esi_deduction: "212.25", pf_deduction: "3396.00", payable: "24691.75" };
  const draft: PayrollDraft = {
    company: { id: "company", name: "Example Manufacturing" }, employees: people,
    payroll: { id: "register", company_id: "company", company_name: "Example Manufacturing", company_location: "Mysore", month: "2026-10", notes: "Approved attendance", lines, totals, revision: 1, created_at: "2026-10-16T00:00:00Z", updated_at: "2026-10-16T00:00:00Z" },
  };
  const input: PayrollInput = {
    company_id: "company", month: "2026-10", notes: draft.payroll!.notes,
    lines: lines.map(({ assignment_id, worked_days, daily_rate, esi_percentage, pf_percentage }) => ({ assignment_id, worked_days, daily_rate, esi_percentage, pf_percentage })),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["payroll-preview", input], { lines, totals });
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(PayrollEditor, {
    draft, month: "2026-10", deleting: false, onDirty: () => {}, onBusy: () => {}, onReload: async () => {},
  })));
  expect(html).toContain('data-testid="payroll-detail-panel"');
  expect(html).toContain("Ravi Kumar");
  expect(html).toContain("Anitha");
  expect(html).toContain('data-testid="payroll-days-first"');
  expect(html).not.toContain('data-testid="payroll-days-second"');
  expect(html).toContain("₹24,691.75");
  expect(html).toContain("₹3,608.25");
  expect(html).toContain('value="12.00"');
  expect(html).toContain('aria-label="Select all employees"');
  expect(html).toContain("Back to employee register");
  client.clear();
});

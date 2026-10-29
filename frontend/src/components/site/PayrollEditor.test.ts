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
  const register = {
    calculation_method: "Daily" as const, base_salary: "0", days_absent: "0", credit_leave: "0", government_holidays: "0",
    salary_advance: "0", penalty: "0", allowance: "0", esi_employer_percentage: "3.25", pf_employer_percentage: "12",
    overtime_hours: "0", overtime_rate: "0", loss_of_pay: "0.00", sunday_holidays: 4, paid_days: "26.00",
    per_day_salary: "500.00", per_hour_salary: "55.56", leave_deduction: "0.00", overtime_amount: "0.00",
    effective_overtime_rate: "0.00", esi_employer_contribution: "422.50", pf_employer_contribution: "1560.00",
  };
  const lines = [
    { ...people[0], ...register, worked_days: "26.00", daily_rate: "500.00", esi_percentage: "0.75", pf_percentage: "12.00", gross_wages: "13000.00", esi_deduction: "97.50", pf_deduction: "1560.00", payable: "11342.50" },
    { ...people[1], ...register, paid_days: "25.50", worked_days: "25.50", daily_rate: "600.00", per_day_salary: "600.00", gross_wages: "15300.00", esi_percentage: "0.75", esi_deduction: "114.75", esi_employer_contribution: "497.25", pf_percentage: "12.00", pf_deduction: "1836.00", pf_employer_contribution: "1836.00", payable: "13349.25" },
  ];
  const totals = { employee_count: 2, worked_days: "51.50", gross_wages: "28300.00", esi_deduction: "212.25", pf_deduction: "3396.00", payable: "24691.75" };
  const draft: PayrollDraft = {
    company: { id: "company", name: "Dhatu Organics & Naturals" }, employees: people,
    payroll: { id: "register", company_id: "company", company_name: "Dhatu Organics & Naturals", company_location: "Mysore", month: "2026-10", notes: "Approved attendance", lines, totals, revision: 1, created_at: "2026-10-16T00:00:00Z", updated_at: "2026-10-16T00:00:00Z" },
  };
  const input: PayrollInput = {
    company_id: "company", month: "2026-10", notes: draft.payroll!.notes, cost_responsibility: "Agency", attendance_refs: {},
    lines: lines.map(({ assignment_id, calculation_method, worked_days, daily_rate, base_salary, days_absent, credit_leave, government_holidays, salary_advance, penalty, allowance, esi_percentage, esi_employer_percentage, pf_percentage, pf_employer_percentage, overtime_hours, overtime_rate }) => ({ assignment_id, calculation_method, worked_days, daily_rate, base_salary, days_absent, credit_leave, government_holidays, salary_advance, penalty, allowance, esi_percentage, esi_employer_percentage, pf_percentage, pf_employer_percentage, overtime_hours, overtime_rate })),
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
  expect(html).toContain("Sunday holidays: 4");
  expect(html).toContain("Employer ESI");
  expect(html).toContain("Back to employee register");
  client.clear();
});

it("hides the monthly register and Sunday holidays for other companies", () => {
  const employee = { assignment_id: "first", employee_id: "0001", full_name: "Ravi Kumar", role: "Operator", salary: "500.00", salary_basis: "Daily" as const, status: "Active" as const };
  const draft: PayrollDraft = { company: { id: "other", name: "Example Manufacturing" }, employees: [employee], payroll: null };
  const input: PayrollInput = {
    company_id: "other", month: "2026-10", notes: "", cost_responsibility: "Agency", attendance_refs: {},
    lines: [{ assignment_id: "first", calculation_method: "Daily", worked_days: "0", daily_rate: "500.00", base_salary: "0", days_absent: "0", credit_leave: "0", government_holidays: "0", salary_advance: "0", penalty: "0", allowance: "0", esi_percentage: "0", esi_employer_percentage: "0", pf_percentage: "0", pf_employer_percentage: "0", overtime_hours: "0", overtime_rate: "0" }],
  };
  const totals = { employee_count: 1, worked_days: "0.00", paid_days: "0.00", gross_wages: "0.00", esi_deduction: "0.00", pf_deduction: "0.00", payable: "0.00" };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["payroll-preview", input], { lines: [], totals });
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(PayrollEditor, {
    draft, month: "2026-10", deleting: false, onDirty: () => {}, onBusy: () => {}, onReload: async () => {},
  })));
  expect(html).not.toContain("Sunday holidays:");
  expect(html).not.toContain("Monthly salary register");
  expect(html).not.toContain("Employer ESI (%)");
  expect(html).toContain("Gross wages include worked days");
  client.clear();
});

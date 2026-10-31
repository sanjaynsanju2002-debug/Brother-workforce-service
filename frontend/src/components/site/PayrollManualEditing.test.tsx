// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import PayrollEditor from "./PayrollEditor";
import type { PayrollDraft, PayrollInput } from "@/lib/payroll";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("lets an excluded employee edit attendance and ESI, automatically includes them, and saves balanced paid days", async () => {
  const draft: PayrollDraft = { company: { id: "dhatu", name: "DONPL" }, employees: [{ assignment_id: "manual", employee_id: "TEST-01", full_name: "Test Employee", role: "Packing", salary: "31000", salary_basis: "Monthly", status: "Completed" }], payroll: null };
  const savedInputs: PayrollInput[] = [];
  const lineAmounts = { assignment_id: "manual", loss_of_pay: "5.50", sunday_holidays: 4, paid_days: "25.50", per_day_salary: "1000.00", per_hour_salary: "125.00", leave_deduction: "5500.00", overtime_amount: "0.00", effective_overtime_rate: "125.00", gross_wages: "25500.00", esi_deduction: "191.25", esi_employer_contribution: "0.00", pf_deduction: "0.00", pf_employer_contribution: "0.00", payable: "25308.75" };
  const totals = { employee_count: 1, worked_days: "21.50", paid_days: "25.50", gross_wages: "25500.00", esi_deduction: "191.25", pf_deduction: "0.00", payable: "25308.75" };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as PayrollInput;
    if (url.endsWith("/preview")) return new Response(JSON.stringify({ lines: body.lines.length ? [lineAmounts] : [], totals }));
    if (url === "/api/admin/payroll") {
      savedInputs.push(body);
      return new Response(JSON.stringify({ ...body, id: "saved", company_name: "DONPL", company_location: "Mysore", lines: [{ ...draft.employees[0], ...body.lines[0], ...lineAmounts, paid_sundays: 4 }], totals, revision: 1, created_at: "2026-10-31T15:00:00Z", updated_at: "2026-10-31T15:00:00Z" }));
    }
    throw new Error(`Unexpected request ${url}`);
  }));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  const input = (name: string) => host.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  const enter = (name: string, value: string) => act(() => {
    const field = input(name);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
  try {
    act(() => root.render(<QueryClientProvider client={qc}><PayrollEditor draft={draft} month="2026-10" deleting={false} onDirty={() => {}} onBusy={() => {}} onReload={async () => {}} /></QueryClientProvider>));
    for (const field of ["worked_days", "days_absent", "credit_leave", "government_holidays", "paid_sundays", "total_paid_days", "esi_percentage", "pf_percentage"]) expect(input(field).disabled).toBe(false);
    expect(host.textContent).toContain("This employee is not included yet");
    enter("esi_percentage", "0.75");
    expect(host.querySelector<HTMLInputElement>('[aria-label="Include Test Employee in payroll"]')!.checked).toBe(true);
    enter("total_paid_days", "25.5");
    expect(input("worked_days").value).toBe("21.5");
    expect(input("days_absent").value).toBe("5.5");
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(host.querySelector('[data-testid="payroll-active-payable"]')?.textContent).toBe("₹25,308.75");
    });
    act(() => host.querySelector<HTMLButtonElement>('[data-testid="payroll-save"]')!.click());
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(savedInputs).toHaveLength(1);
    });
    expect(savedInputs[0].lines[0]).toMatchObject({ assignment_id: "manual", worked_days: "21.5", days_absent: "5.5", paid_sundays: "4", esi_percentage: "0.75" });
    expect(savedInputs[0].lines[0]).not.toHaveProperty("total_paid_days");
    expect(input("total_paid_days").value).toBe("25.5");
  } finally {
    act(() => root.unmount()); qc.clear(); vi.unstubAllGlobals(); host.remove();
  }
});

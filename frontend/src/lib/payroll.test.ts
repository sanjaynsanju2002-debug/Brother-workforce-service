import { describe, expect, it } from "vitest";
import { editPayrollRow, firstPayrollIssue, isDhatuOrganicsCompany, payrollDeductionTotal, payrollEmployerContributionTotal, payrollRows, sundayDates, type PayrollDraft, type PayrollRow, type PayrollTotals } from "./payroll";

function employee(id: string, updates: Partial<PayrollRow> = {}): PayrollRow {
  return {
    assignment_id: id, employee_id: `BWS-${id}`, full_name: `Employee ${id}`, role: "Operator", salary: "500.00", salary_basis: "Daily", status: "Active",
    selected: true, calculation_method: "Daily", worked_days: "26", daily_rate: "500.00", base_salary: "0",
    days_absent: "0", credit_leave: "0", government_holidays: "0", salary_advance: "0", penalty: "0", allowance: "0",
    esi_percentage: "0.75", esi_employer_percentage: "3.25", pf_percentage: "12", pf_employer_percentage: "12",
    overtime_hours: "0", overtime_rate: "0", ...updates,
  };
}

describe("payroll validation with a single employee details panel", () => {
  it("finds missing inputs in an employee whose panel has not been opened", () => {
    const result = firstPayrollIssue([employee("first"), employee("unopened", { worked_days: "" })], 31);
    expect(result?.assignment_id).toBe("unopened");
    expect(result?.field).toBe("worked_days");
    expect(result?.message).toContain("Employee unopened");
  });

  it("ignores incomplete employees who are excluded from this payroll", () => {
    expect(firstPayrollIssue([employee("included"), employee("excluded", { selected: false, worked_days: "", daily_rate: "", pf_percentage: "" })], 31)).toBeUndefined();
  });

  it("allows fractional attendance, zero deductions and zero attendance without a rate", () => {
    expect(firstPayrollIssue([
      employee("fractional", { worked_days: "25.5", esi_percentage: ".75", pf_percentage: "0" }),
      employee("absent", { worked_days: "0", daily_rate: "", esi_percentage: "0", pf_percentage: "0" }),
    ], 31)).toBeUndefined();
  });

  it.each([
    ["worked_days", "29", 28], ["worked_days", "-1", 31], ["worked_days", "1.001", 31],
    ["daily_rate", "0", 31], ["daily_rate", "", 31], ["daily_rate", "Infinity", 31],
    ["esi_percentage", "", 31], ["esi_percentage", "101", 31], ["pf_percentage", "-1", 31], ["pf_percentage", "12.001", 31],
  ] as const)("blocks invalid %s=%s before saving the whole register", (field, value, days) => {
    expect(firstPayrollIssue([employee("first"), employee("invalid", { [field]: value })], days)).toMatchObject({ assignment_id: "invalid", field });
  });

  it("rejects combined deductions over 100% and all-zero attendance", () => {
    expect(firstPayrollIssue([employee("a", { esi_percentage: "60", pf_percentage: "50" })], 31)?.field).toBe("pf_percentage");
    expect(firstPayrollIssue([employee("a", { worked_days: "0" }), employee("b", { worked_days: "0" })], 31)?.message).toContain("at least one");
    expect(firstPayrollIssue([employee("a", { esi_percentage: "33.33", pf_percentage: "66.67" })], 31)).toBeUndefined();
  });
});

it("prefills daily rates and monthly salary register values from Company Workforce", () => {
  const people = [employee("daily"), employee("monthly", { salary_basis: "Monthly", salary: "15600.00" }), employee("completed", { status: "Completed" })];
  const draft: PayrollDraft = { company: { id: "company", name: "Dhatu Organics & Naturals" }, employees: people, payroll: null };
  const rows = payrollRows(draft);
  expect(rows[0].daily_rate).toBe("500.00");
  expect(rows[0].worked_days).toBe("");
  expect(rows[1].daily_rate).toBe("0");
  expect(rows[1].base_salary).toBe("15600.00");
  expect(rows[1].calculation_method).toBe("Monthly");
  expect(rows[2].selected).toBe(false);
});

it("keeps the monthly salary register exclusive to Dhatu Organics", () => {
  expect(isDhatuOrganicsCompany("Dhatu Organics & Naturals Pvt Ltd")).toBe(true);
  expect(isDhatuOrganicsCompany("DONPL")).toBe(true);
  expect(isDhatuOrganicsCompany("Example Manufacturing")).toBe(false);
  const person = employee("monthly", { salary_basis: "Monthly", salary: "15600.00" });
  const rows = payrollRows({ company: { id: "other", name: "Example Manufacturing" }, employees: [person], payroll: null });
  expect(rows[0].calculation_method).toBe("Daily");
  expect(rows[0].daily_rate).toBe("");
  expect(rows[0].base_salary).toBe("0");
});

it("combines the saved ESI and PF amounts exactly for the summary card", () => {
  const totals: PayrollTotals = { employee_count: 3, worked_days: "75.50", gross_wages: "41500.00", esi_deduction: "311.25", pf_deduction: "4980.00", payable: "36208.75" };
  expect(payrollDeductionTotal(totals)).toBe("5291.25");
  expect(payrollDeductionTotal({ ...totals, esi_deduction: "0.10", pf_deduction: "0.20" })).toBe("0.30");
  expect(payrollDeductionTotal({ ...totals, esi_deduction: "9999999999999.99", pf_deduction: "0.01" })).toBe("10000000000000.00");
  expect(payrollEmployerContributionTotal({ ...totals, esi_employer_contribution: "455.00", pf_employer_contribution: "0.00" })).toBe("455.00");
});

it("lists every Sunday for the selected payroll month without timezone drift", () => {
  expect(sundayDates("2026-09")).toEqual([6, 13, 20, 27]);
  expect(sundayDates("2026-05")).toEqual([3, 10, 17, 24, 31]);
});

it("validates the monthly salary register fields", () => {
  const monthly = employee("monthly", { calculation_method: "Monthly", salary_basis: "Monthly", base_salary: "15000", worked_days: "24", days_absent: "2", credit_leave: "0", government_holidays: "1", daily_rate: "0", overtime_rate: "0" });
  expect(firstPayrollIssue([monthly], 30)).toBeUndefined();
  expect(firstPayrollIssue([{ ...monthly, credit_leave: "3" }], 30)).toMatchObject({ field: "credit_leave" });
  expect(firstPayrollIssue([{ ...monthly, base_salary: "0" }], 30)).toMatchObject({ field: "base_salary" });
});


it("defaults new Dhatu monthly payroll to full calendar pay with editable Sundays and 8 hours", () => {
  const person = employee("monthly", { salary_basis: "Monthly", salary: "15000" });
  const row = payrollRows({ company: { id: "dhatu", name: "DONPL" }, employees: [person], payroll: null }, "2026-10")[0];
  expect(row).toMatchObject({ monthly_pay_basis: "PaidDays", base_salary: "15000", worked_days: "27", days_absent: "0", paid_sundays: "4", hours_per_day: "8" });
  expect(firstPayrollIssue([row], 31, 4)).toBeUndefined();
  const absent = editPayrollRow(row, "days_absent", "2.5", 31, 4);
  expect(absent.worked_days).toBe("24.5");
  const leave = editPayrollRow(absent, "credit_leave", "1.5", 31, 4);
  expect(leave.days_absent).toBe("1");
  expect(firstPayrollIssue([leave], 31, 4)).toBeUndefined();
  expect(firstPayrollIssue([{ ...leave, worked_days: "28" }], 31, 4)?.field).toBe("worked_days");
  expect(firstPayrollIssue([{ ...leave, paid_sundays: "5" }], 31, 4)?.field).toBe("paid_sundays");
  expect(firstPayrollIssue([{ ...leave, hours_per_day: "0" }], 31, 4)?.field).toBe("hours_per_day");
});

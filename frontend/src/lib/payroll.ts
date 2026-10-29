import { ApiError } from "@/lib/api";

export type PayrollMethod = "Daily" | "Monthly";
export type PayrollEmployee = {
  assignment_id: string; employee_id: string | null; full_name: string; role: string | null; start_date?: string | null;
  salary: string | null; salary_basis: PayrollMethod; status: "Active" | "Completed";
};
export type PayrollInputValues = {
  calculation_method: PayrollMethod; worked_days: string; daily_rate: string; base_salary: string;
  days_absent: string; credit_leave: string; government_holidays: string; salary_advance: string;
  penalty: string; allowance: string; esi_percentage: string; esi_employer_percentage: string;
  pf_percentage: string; pf_employer_percentage: string; overtime_hours: string; overtime_rate: string;
};
export type PayrollAmounts = {
  assignment_id: string; loss_of_pay: string; sunday_holidays: number; paid_days: string;
  per_day_salary: string; per_hour_salary: string; leave_deduction: string; overtime_amount: string;
  effective_overtime_rate: string; gross_wages: string; esi_deduction: string;
  esi_employer_contribution: string; pf_deduction: string; pf_employer_contribution: string; payable: string;
};
export type PayrollTotals = {
  employee_count: number; worked_days: string; paid_days?: string; leave_deduction?: string; overtime_amount?: string;
  gross_wages: string; esi_deduction: string; esi_employer_contribution?: string;
  pf_deduction: string; pf_employer_contribution?: string; payable: string;
};
export type PayrollRow = PayrollEmployee & PayrollInputValues & { selected: boolean };
export type PayrollValueField = keyof PayrollInputValues;
export type PayrollIssue = { assignment_id: string; field: PayrollValueField; message: string };
export type PayrollInput = {
  company_id: string; month: string; notes: string; cost_responsibility?: "Agency" | "Client";
  attendance_refs?: Record<string, number>; lines: ({ assignment_id: string } & PayrollInputValues)[];
};
export type PayrollRecord = {
  id: string; company_id: string; company_name: string; company_location: string; month: string; notes: string;
  lines: (PayrollEmployee & PayrollInputValues & PayrollAmounts)[];
  cost_responsibility?: "Agency" | "Client"; attendance_refs?: Record<string, number>;
  totals: PayrollTotals; revision: number; created_at: string; updated_at: string;
};
export type PayrollDraft = { company: { id: string; name: string }; employees: PayrollEmployee[]; payroll: PayrollRecord | null };
export type PayrollCompany = { id: string; name: string; saved_only: boolean };
export type PayrollSummary = Pick<PayrollRecord, "id" | "company_id" | "company_name" | "month" | "totals" | "revision" | "updated_at">;
export type PayrollPage = { items: PayrollSummary[]; total: number; page: number; page_size: number };

const ZERO = "0";

export function isDhatuOrganicsCompany(name: string): boolean {
  const normalized = name.toLocaleLowerCase("en-IN").replace(/[^a-z0-9]+/g, "");
  return normalized === "donpl" || normalized.includes("dhatuorganics");
}

export function sundayDates(month: string): number[] {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || monthNumber < 1 || monthNumber > 12) return [];
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: days }, (_, index) => index + 1)
    .filter((day) => new Date(Date.UTC(year, monthNumber - 1, day)).getUTCDay() === 0);
}

export function payrollRows(draft: PayrollDraft, _month = ""): PayrollRow[] {
  const saved = new Map(draft.payroll?.lines.map((line) => [line.assignment_id, line]) ?? []);
  const monthlyRegisterEnabled = isDhatuOrganicsCompany(draft.company.name);
  return draft.employees.map((person) => {
    const line = saved.get(person.assignment_id);
    const method = monthlyRegisterEnabled ? line?.calculation_method ?? person.salary_basis : "Daily";
    return {
      ...(line ?? person), selected: draft.payroll ? !!line : person.status === "Active",
      calculation_method: method,
      worked_days: line?.worked_days ?? "",
      daily_rate: line?.daily_rate ?? (method === "Monthly" ? ZERO : person.salary_basis === "Daily" ? person.salary ?? "" : ""),
      base_salary: line?.base_salary ?? (method === "Monthly" ? person.salary ?? "" : ZERO),
      days_absent: line?.days_absent ?? ZERO,
      credit_leave: line?.credit_leave ?? ZERO,
      government_holidays: line?.government_holidays ?? ZERO,
      salary_advance: line?.salary_advance ?? ZERO,
      penalty: line?.penalty ?? ZERO,
      allowance: line?.allowance ?? ZERO,
      esi_percentage: line?.esi_percentage ?? ZERO,
      esi_employer_percentage: line?.esi_employer_percentage ?? ZERO,
      pf_percentage: line?.pf_percentage ?? ZERO,
      pf_employer_percentage: line?.pf_employer_percentage ?? ZERO,
      overtime_hours: line?.overtime_hours ?? ZERO,
      overtime_rate: line?.overtime_rate ?? ZERO,
    };
  });
}

const DECIMAL = /^(?:\d+|\d*\.\d{1,2})$/;

// All included employees must be checked even when only one employee's inputs
// are mounted in the details panel. Amounts still come from the backend.
export function firstPayrollIssue(rows: PayrollRow[], monthDays: number): PayrollIssue | undefined {
  const included = rows.filter((row) => row.selected);
  for (const row of included) {
    const attendance = [
      ["worked_days", row.calculation_method === "Monthly" ? "days present" : "worked days", monthDays],
      ["days_absent", "days absent", monthDays], ["credit_leave", "credit leave", monthDays],
      ["government_holidays", "government holidays", monthDays],
    ] as const;
    const money = row.calculation_method === "Monthly"
      ? [["base_salary", "monthly salary", 1_000_000_000], ["salary_advance", "salary loan or advance", 1_000_000_000], ["penalty", "penalty", 1_000_000_000], ["allowance", "allowance", 1_000_000_000]] as const
      : [["daily_rate", "daily rate", 1_000_000_000]] as const;
    const rates = [
      ["esi_percentage", "employee ESI percentage", 100], ["esi_employer_percentage", "employer ESI percentage", 100],
      ["pf_percentage", "employee PF percentage", 100], ["pf_employer_percentage", "employer PF percentage", 100],
      ["overtime_hours", "overtime hours", 744], ["overtime_rate", "overtime hourly rate", 1_000_000_000],
    ] as const;
    for (const [field, label, maximum] of [...attendance, ...money, ...rates]) {
      const value = row[field].trim();
      if (field === "daily_rate" && !value && Number(row.worked_days) === 0) continue;
      if (!value || !DECIMAL.test(value) || !Number.isFinite(Number(value)) || Number(value) > maximum) {
        return { assignment_id: row.assignment_id, field, message: `${row.full_name}: enter ${label} from 0 to ${maximum}, with up to 2 decimal places.` };
      }
    }
    if (row.calculation_method === "Daily" && Number(row.worked_days) > 0 && Number(row.daily_rate) === 0) {
      return { assignment_id: row.assignment_id, field: "daily_rate", message: `${row.full_name}: enter a daily rate greater than 0 for worked days.` };
    }
    if (row.calculation_method === "Monthly" && Number(row.base_salary) === 0) {
      return { assignment_id: row.assignment_id, field: "base_salary", message: `${row.full_name}: enter a monthly salary greater than 0.` };
    }
    if (row.calculation_method === "Daily" && Number(row.overtime_hours) > 0 && !Number(row.overtime_rate)) {
      return { assignment_id: row.assignment_id, field: "overtime_rate", message: `${row.full_name}: enter an hourly overtime rate greater than 0.` };
    }
    if (Number(row.credit_leave) > Number(row.days_absent)) {
      return { assignment_id: row.assignment_id, field: "credit_leave", message: `${row.full_name}: credit leave cannot exceed absent days.` };
    }
    if (Math.round(Number(row.esi_percentage) * 100) + Math.round(Number(row.pf_percentage) * 100) > 10_000) {
      return { assignment_id: row.assignment_id, field: "pf_percentage", message: `${row.full_name}: combined employee ESI and PF percentages cannot exceed 100%.` };
    }
  }
  if (included.length && !included.some((row) => Number(row.worked_days) > 0)) {
    return { assignment_id: included[0].assignment_id, field: "worked_days", message: "Enter days present for at least one included employee." };
  }
}

function exactPaise(value: string | undefined): bigint {
  const [whole, fraction = ""] = (value ?? "0").split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function paiseText(value: bigint): string {
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

export function payrollDeductionTotal(totals: PayrollTotals): string {
  return paiseText(exactPaise(totals.esi_deduction) + exactPaise(totals.pf_deduction));
}

export function payrollEmployerContributionTotal(totals: PayrollTotals): string {
  return paiseText(exactPaise(totals.esi_employer_contribution) + exactPaise(totals.pf_employer_contribution));
}

export function payrollError(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body as { detail?: string | { msg?: string }[] } | null;
    if (typeof body?.detail === "string") return body.detail;
    if (Array.isArray(body?.detail)) return body.detail[0]?.msg || "Check the payroll inputs";
    if (error.status === 401) return "Your session expired. Sign in again.";
  }
  return "Could not complete the payroll request. Please try again.";
}

export async function downloadPayroll(record: Pick<PayrollRecord, "id" | "month">, format: "pdf" | "xlsx") {
  const response = await fetch(`/api/admin/payroll/${record.id}/download/${format}`);
  if (!response.ok) throw new ApiError(response.status, await response.json().catch(() => null));
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `BWS-Payroll-${record.month}.${format}`;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

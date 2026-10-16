import { ApiError } from "@/lib/api";

export type PayrollEmployee = {
  assignment_id: string; employee_id: string | null; full_name: string; role: string | null;
  salary: string | null; salary_basis: "Monthly" | "Daily"; status: "Active" | "Completed";
};
export type PayrollAmounts = { assignment_id: string; gross_wages: string; esi_deduction: string; pf_deduction: string; payable: string };
export type PayrollTotals = { employee_count: number; worked_days: string; gross_wages: string; esi_deduction: string; pf_deduction: string; payable: string };
export type PayrollRow = PayrollEmployee & { selected: boolean; worked_days: string; daily_rate: string; esi_percentage: string; pf_percentage: string };
export type PayrollValueField = "worked_days" | "daily_rate" | "esi_percentage" | "pf_percentage";
export type PayrollIssue = { assignment_id: string; field: PayrollValueField; message: string };
export type PayrollInput = { company_id: string; month: string; notes: string; lines: { assignment_id: string; worked_days: string; daily_rate: string; esi_percentage: string; pf_percentage: string }[] };
export type PayrollRecord = {
  id: string; company_id: string; company_name: string; company_location: string; month: string; notes: string;
  lines: (PayrollEmployee & PayrollAmounts & { worked_days: string; daily_rate: string; esi_percentage: string; pf_percentage: string })[];
  totals: PayrollTotals; revision: number; created_at: string; updated_at: string;
};
export type PayrollDraft = { company: { id: string; name: string }; employees: PayrollEmployee[]; payroll: PayrollRecord | null };
export type PayrollCompany = { id: string; name: string; saved_only: boolean };
export type PayrollSummary = Pick<PayrollRecord, "id" | "company_id" | "company_name" | "month" | "totals" | "revision" | "updated_at">;
export type PayrollPage = { items: PayrollSummary[]; total: number; page: number; page_size: number };

export function payrollRows(draft: PayrollDraft): PayrollRow[] {
  const saved = new Map(draft.payroll?.lines.map((line) => [line.assignment_id, line]) ?? []);
  return draft.employees.map((person) => {
    const line = saved.get(person.assignment_id);
    return {
      ...(line ?? person), selected: draft.payroll ? !!line : person.status === "Active",
      worked_days: line?.worked_days ?? "", daily_rate: line?.daily_rate ?? (person.salary_basis === "Daily" ? person.salary ?? "" : ""),
      esi_percentage: line?.esi_percentage ?? "0",
      pf_percentage: line?.pf_percentage ?? "0",
    };
  });
}

// All included employees must be checked even when only one employee's inputs
// are mounted in the details panel. Amounts still come from the backend.
export function firstPayrollIssue(rows: PayrollRow[], monthDays: number): PayrollIssue | undefined {
  const included = rows.filter((row) => row.selected);
  for (const row of included) {
    for (const [field, label, maximum] of [
      ["worked_days", "worked days", monthDays], ["daily_rate", "daily rate", 1_000_000_000],
      ["esi_percentage", "ESI percentage", 100], ["pf_percentage", "PF percentage", 100],
    ] as const) {
      const value = row[field].trim();
      if (field === "daily_rate" && !value && Number(row.worked_days) === 0) continue;
      if (!value || !/^(?:\d+|\d*\.\d{1,2})$/.test(value) || !Number.isFinite(Number(value)) || Number(value) > maximum) {
        return { assignment_id: row.assignment_id, field, message: `${row.full_name}: enter ${label} from 0 to ${maximum}, with up to 2 decimal places.` };
      }
      if (field === "daily_rate" && Number(row.worked_days) > 0 && Number(value) === 0) {
        return { assignment_id: row.assignment_id, field, message: `${row.full_name}: enter a daily rate greater than 0 for worked days.` };
      }
    }
    if (Math.round(Number(row.esi_percentage) * 100) + Math.round(Number(row.pf_percentage) * 100) > 10_000) {
      return { assignment_id: row.assignment_id, field: "pf_percentage", message: `${row.full_name}: combined ESI and PF percentages cannot exceed 100%.` };
    }
  }
  if (included.length && !included.some((row) => Number(row.worked_days) > 0)) {
    return { assignment_id: included[0].assignment_id, field: "worked_days", message: "Enter worked days for at least one included employee." };
  }
}

export function payrollDeductionTotal(totals: PayrollTotals): string {
  const paise = (value: string) => { const [whole, fraction = ""] = value.split("."); return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")); };
  const total = paise(totals.esi_deduction) + paise(totals.pf_deduction);
  return `${total / 100n}.${String(total % 100n).padStart(2, "0")}`;
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

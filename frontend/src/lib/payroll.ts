import { ApiError } from "@/lib/api";

export type PayrollEmployee = {
  assignment_id: string; employee_id: string | null; full_name: string; role: string | null;
  salary: string | null; salary_basis: "Monthly" | "Daily"; status: "Active" | "Completed";
};
export type PayrollAmounts = { assignment_id: string; gross_wages: string; esi_deduction: string; pf_deduction: string; payable: string };
export type PayrollTotals = { employee_count: number; worked_days: string; gross_wages: string; esi_deduction: string; pf_deduction: string; payable: string };
export type PayrollRow = PayrollEmployee & { selected: boolean; worked_days: string; daily_rate: string; esi_percentage: string; pf_percentage: string };
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

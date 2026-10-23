import { useQueryClient } from "@tanstack/react-query";
import { ApiError, apiGet } from "@/lib/api";

export const OPS = "/admin/operations";
export type CompanyOption = { id: string; name: string; archived?: boolean };
export type WorkerOption = { id: string; full_name: string; education?: string; mobile?: string; status: string };
export type PaymentEntry = { id: string; amount: string; payment_date: string; method: string; reference: string; notes: string; by: string; kind?: "Advance" | "Salary"; assignment_id?: string; voided_at?: string | null; void_reason?: string };
export type InvoicePaymentRecord = { id: string; revision: number; invoice_number: string; client_name: string; invoice_date: string; totals: { total: string }; payment_status: string; opening_paid_amount?: string | null; payments?: PaymentEntry[]; follow_up_date?: string | null };
export type AttendanceSummary = { lines: { assignment_id: string; full_name: string; worked_days: string; overtime_hours: string }[]; sheets: { id: string; date: string; revision: number }[]; approved_days: number };
export const operationError = (error: unknown) => {
  if (error instanceof ApiError) {
    const detail = (error.body as { detail?: string | { msg: string }[] } | null)?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail[0]?.msg ?? "Check the entered details.";
    if (error.status === 401) return "Your session expired. Sign in again.";
  }
  return "Could not complete this request. Please try again.";
};
const paise = (value: string) => { const [whole, decimals = ""] = value.split("."); return BigInt(whole || 0) * 100n + BigInt(decimals.padEnd(2, "0").slice(0, 2)); };
const asMoney = (value: bigint) => `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
export function invoicePaid(invoice: InvoicePaymentRecord) {
  const opening = invoice.opening_paid_amount ?? (invoice.payment_status === "Paid" ? invoice.totals.total : "0");
  return asMoney((invoice.payments ?? []).filter((p) => !p.voided_at).reduce((sum, p) => sum + paise(p.amount), paise(opening)));
}
export function invoiceBalance(invoice: InvoicePaymentRecord) { return asMoney(paise(invoice.totals.total) - paise(invoicePaid(invoice))); }
export async function downloadPrivate(path: string, filename: string) {
  const response = await fetch(`/api${path}`);
  if (!response.ok) throw new ApiError(response.status, await response.json().catch(() => null));
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export const getCompanies = () => apiGet<CompanyOption[]>("/admin/clients");

export const selectClass = "min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-[#0F2444] disabled:opacity-60";
export const box = "rounded-xl border border-slate-200 bg-white p-5 sm:p-6";
export function useOperationsRefresh() {
  const qc = useQueryClient();
  return () => { for (const queryKey of [["ops"], ["invoices"], ["payroll-history"], ["payroll-draft"], ["admin-profit-loss"]]) void qc.invalidateQueries({ queryKey }); };
}

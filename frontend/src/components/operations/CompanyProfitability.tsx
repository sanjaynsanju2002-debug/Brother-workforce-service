import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DateInput } from "@/components/ui/date-input";
import { apiGet } from "@/lib/api";
import { indiaToday, rupees } from "@/lib/finance";
import { OPS } from "@/lib/operations";
import { Field, Heading, QueryStatus } from "./Common";
import { box } from "@/lib/operations";

type Row = { company_id: string | null; company_name: string; archived: boolean; revenue: string; payroll_cost: string; operating_expenses: string; salary_cash_expenses: string; profit: string; payroll_registers: number; invoice_count: number };
export default function CompanyProfitability() {
  const [month, setMonth] = useState(indiaToday().slice(0, 7));
  const query = useQuery({ queryKey: ["ops", "profitability", month], queryFn: () => apiGet<{ items: Row[]; unassigned_month_revenue: string }>(`${OPS}/profitability?month=${month}`) });
  return <section className="space-y-5" data-testid="company-profitability-panel"><Heading title="Company Profitability" text="Compare invoice revenue before GST with agency payroll gross wages and operating expenses for each company. Revenue follows the service month; expenses follow the expense date."><Field label="Month"><DateInput aria-label="Company profitability month" type="month" required value={month} onValueChange={(v) => v ? setMonth(v) : false} /></Field></Heading>
    <QueryStatus pending={query.isPending} error={query.error} retry={() => query.refetch()} />
    {query.data && <>{Number(query.data.unassigned_month_revenue) > 0 && <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{rupees(query.data.unassigned_month_revenue)} of invoice revenue has no service month. Set those invoice months to include it in this report.</p>}
      <div className={`${box} overflow-x-auto`}>{!query.data.items.length ? <p className="text-sm text-slate-500">No invoices, payroll or expenses for this month.</p> : <table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b text-xs text-slate-500"><tr>{["Company", "Invoice revenue", "Agency payroll", "Operating expenses", "Profit / loss"].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{query.data.items.map((r) => <tr key={r.company_id ?? "unassigned"} className="border-b align-top"><th scope="row" className="max-w-56 p-3 font-medium"><span className="break-words">{r.company_name}</span>{r.archived && <span className="mt-1 block text-xs text-slate-500">Archived</span>}{r.invoice_count > 0 && r.payroll_registers === 0 && <span className="mt-1 block text-xs font-normal text-amber-800">No saved payroll; review whether salary cost is missing.</span>}</th><td className="p-3 tabular-nums">{rupees(r.revenue)}</td><td className="p-3 tabular-nums">{rupees(r.payroll_cost)}</td><td className="p-3 tabular-nums">{rupees(r.operating_expenses)}</td><td className={`p-3 font-semibold tabular-nums ${Number(r.profit) < 0 ? "text-red-700" : "text-emerald-800"}`}>{rupees(r.profit)}</td></tr>)}</tbody></table>}</div>
      <div className="space-y-2 text-sm leading-relaxed text-slate-600"><p>In Payroll, choose who pays salaries: Agency or Client. Client-paid salary registers are reference records and do not reduce agency profit. Services-only invoices include the service charge as revenue.</p><p>Tag costs with a company in Expenses. Costs without a company appear under Unassigned company; review them before assessing individual company margins.</p><p>Salary cash entries tagged Payroll in Expenses are shown in the existing Profit &amp; Loss report, but are excluded here to avoid counting saved payroll twice. This report uses saved agency payroll gross wages. Review older salary expenses and tag them Payroll.</p></div>
      {query.data.items.some((r) => Number(r.salary_cash_expenses) > 0) && <div className={`${box} space-y-2`}><h2 className="font-semibold">Salary cash expenses excluded from this report</h2>{query.data.items.filter((r) => Number(r.salary_cash_expenses) > 0).map((r) => <p key={r.company_id ?? "unassigned"} className="text-sm">{r.company_name}: {rupees(r.salary_cash_expenses)}</p>)}</div>}
    </>}
  </section>;
}

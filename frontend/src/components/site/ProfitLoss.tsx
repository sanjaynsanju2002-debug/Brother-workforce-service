import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet } from "@/lib/api";
import { indiaToday, monthLabel, rupees, type ProfitLoss as ProfitLossData } from "@/lib/finance";

export default function ProfitLoss() {
  const [month, setMonth] = useState(indiaToday().slice(0, 7));
  const report = useQuery({ queryKey: ["admin-profit-loss", month], queryFn: () => apiGet<ProfitLossData>(`/admin/profit-loss?month=${month}`) });
  const data = report.data;
  return (
    <section data-testid="profit-loss-panel" className="space-y-6 text-[#0F2444]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-2xl font-bold">Profit &amp; Loss</h1><p className="mt-1 text-sm text-slate-600">Revenue by service month, matched with that month’s recorded expenses.</p></div>
        <div><Label htmlFor="profit-loss-month" className="mb-2 block">Month</Label><Input id="profit-loss-month" type="month" value={month} onChange={(e) => { if (e.target.value) setMonth(e.target.value); }} data-testid="profit-loss-month" /></div>
      </div>
      {report.isPending ? <p role="status">Loading monthly figures…</p> : report.isError ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-white p-6"><p>Monthly figures could not be loaded.</p><Button className="mt-3" variant="outline" onClick={() => report.refetch()}>Try again</Button></div>
      ) : data && <>
        <p className="text-sm font-semibold">{monthLabel(month)}</p>
        {data.unassigned_invoice_count > 0 && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{data.unassigned_invoice_count} older invoice{data.unassigned_invoice_count === 1 ? " needs" : "s need"} a service month ({rupees(data.unassigned_invoice_revenue)} before GST, across all months). Open these invoices in Invoices, choose their Service month and save them to include them in monthly revenue.</p>}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border bg-white p-6"><p className="text-sm text-slate-600">Invoice revenue</p><p className="mt-2 break-words text-2xl font-bold" data-testid="profit-loss-revenue">{rupees(data.revenue)}</p><p className="mt-2 text-xs text-slate-500">{data.invoice_count} invoice{data.invoice_count === 1 ? "" : "s"} · before GST</p></div>
          <div className="rounded-xl border bg-white p-6"><p className="text-sm text-slate-600">Recorded expenses</p><p className="mt-2 break-words text-2xl font-bold" data-testid="profit-loss-expenses">{rupees(data.expenses)}</p><p className="mt-2 text-xs text-slate-500">{data.expense_count} expense{data.expense_count === 1 ? "" : "s"} · amounts entered</p></div>
          <div className={`rounded-xl border p-6 ${Number(data.profit_loss) < 0 ? "border-red-200 bg-red-50 text-red-900" : "border-green-200 bg-green-50 text-green-900"}`}><p className="text-sm">{Number(data.profit_loss) < 0 ? "Loss" : "Profit"}</p><p className="mt-2 break-words text-2xl font-bold" data-testid="profit-loss-result">{rupees(data.profit_loss)}</p><p className="mt-2 text-xs">Invoice revenue minus recorded expenses</p></div>
        </div>
        {data.invoice_count === 0 && data.expense_count === 0 && <p className="rounded-xl border border-dashed bg-white p-6">No invoices or expenses have been recorded for this month.</p>}
        <div className="rounded-xl border bg-white p-6">
          <h2 className="font-semibold">Unpaid invoices for this service month</h2><p className="mt-2 text-xl font-bold" data-testid="profit-loss-unpaid">{rupees(data.unpaid_invoice_amount)}</p><p className="mt-1 text-sm text-slate-600">{data.unpaid_invoice_count} unpaid invoice{data.unpaid_invoice_count === 1 ? "" : "s"} · full invoice amounts, including any tax.</p>
        </div>
        <div className="space-y-2 text-sm leading-relaxed text-slate-600"><p>October services invoiced in November count as October revenue. Revenue includes both paid and pending invoices, before GST. Expenses follow the month of the expense date you enter.</p><p>Record salaries, rent, travel and other business costs in Expenses to include them here. Figures update when you save, edit or delete an invoice or expense.</p></div>
      </>}
    </section>
  );
}

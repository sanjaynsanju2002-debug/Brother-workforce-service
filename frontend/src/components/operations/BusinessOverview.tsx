import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { monthLabel, rupees } from "@/lib/finance";
import { OPS } from "@/lib/operations";
import { QueryStatus } from "./Common";
import { box } from "@/lib/operations";

type Reminder = { id: string; kind: string; title: string; date: string; tab: string };
type Data = { date: string; month: string; deployed_workers: number; deployments: number; available_workers: number; absent: number; leave: number; half_days: number; unmarked: number; draft_sheets: number; missing_documents: number; expiring_documents: number; shortages: number; receipts_month: string; outstanding: string; overdue: string; salary_payable: string; salary_paid: string; salary_balance: string; reminders: Reminder[] };
export default function BusinessOverview({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const query = useQuery({ queryKey: ["ops", "overview"], queryFn: () => apiGet<Data>(`${OPS}/overview`), refetchInterval: 60_000 });
  const [all, setAll] = useState(false); const d = query.data;
  return <section className="mb-7 space-y-5" data-testid="business-overview"><QueryStatus pending={query.isPending} error={query.error} retry={() => query.refetch()} />{d && <>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Your business today</h2><p className="mt-1 text-xs text-slate-500">{d.date} · India time · Financial month {monthLabel(d.month)}</p></div><Button variant="outline" size="sm" onClick={() => query.refetch()}>Refresh figures</Button></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[
      { label: "Deployed / available people", value: `${d.deployed_workers} / ${d.available_workers}`, note: `${d.deployments} active company deployments`, tab: "workforce" },
      { label: "Absent / on leave today", value: `${d.absent} / ${d.leave}`, note: `${d.half_days} half-days · approved attendance only`, tab: "attendance" },
      { label: "Workers needed", value: String(d.shortages), note: "Open staffing targets minus active deployments", tab: "requirements" },
      { label: "Client receipts this month", value: rupees(d.receipts_month), note: "Itemised receipts by payment date; earlier Paid statuses have no date", tab: "invoices" },
      { label: "Client balance / overdue", value: rupees(d.outstanding), note: `${rupees(d.overdue)} past invoice due date · all service months`, tab: "invoices" },
      { label: "Salary balance this month", value: rupees(d.salary_balance), note: `${rupees(d.salary_paid)} paid / ${rupees(d.salary_payable)} net payable · agency payroll`, tab: "salary-payments" },
    ].map((m) => <button type="button" key={m.label} onClick={() => onNavigate(m.tab)} className="min-w-0 rounded-xl border bg-white p-4 text-left transition-colors hover:border-orange-300 focus-visible:outline-2 focus-visible:outline-orange-600"><p className="text-xs text-slate-500">{m.label}</p><p className="mt-2 break-words text-xl font-semibold text-[#0F2444]">{m.value}</p><p className="mt-2 text-xs leading-relaxed text-slate-500">{m.note}</p></button>)}</div>
    {(d.unmarked > 0 || d.draft_sheets > 0) && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p>{d.unmarked} deployments have no approved attendance today · {d.draft_sheets} draft sheets need review.</p><Button size="sm" variant="outline" onClick={() => onNavigate("attendance")}>Review attendance</Button></div>}
    {(d.missing_documents > 0 || d.expiring_documents > 0) && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900"><p>{d.missing_documents} missing documents · {d.expiring_documents} expired or expiring within 30 days.</p><Button size="sm" variant="outline" onClick={() => onNavigate("documents")}>Review documents</Button></div>}
    <div className={`${box} space-y-4`}><div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">Follow-ups & document dates ({d.reminders.length})</h3><span className="text-xs text-slate-500">Due follow-ups and documents expiring within 30 days</span></div>{!d.reminders.length ? <p className="text-sm text-slate-500">No follow-ups or document dates need attention. Add next follow-up dates as you work.</p> : <div className="divide-y">{(all ? d.reminders : d.reminders.slice(0, 8)).map((r) => <button key={r.id} className="flex w-full flex-wrap items-start justify-between gap-3 py-3 text-left hover:text-orange-800" onClick={() => onNavigate(r.tab)}><span className="min-w-0 flex-1"><span className="block text-xs text-slate-500">{r.kind}</span><span className="mt-1 block break-words text-sm font-medium">{r.title}</span></span><span className={`text-xs font-medium ${r.date < d.date ? "text-red-700" : "text-slate-500"}`}>{r.date}</span></button>)}</div>}{d.reminders.length > 8 && <Button variant="outline" size="sm" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${d.reminders.length}`}</Button>}</div>
  </>}</section>;
}

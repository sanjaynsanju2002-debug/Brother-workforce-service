import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Download, FileSpreadsheet, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiDelete, apiGet } from "@/lib/api";
import { indiaToday, monthLabel, rupees } from "@/lib/finance";
import { downloadPayroll, payrollError, type PayrollCompany, type PayrollDraft, type PayrollPage, type PayrollSummary } from "@/lib/payroll";
import PayrollEditor from "./PayrollEditor";
import "./Payroll.css";

const selectStyle = "h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50";

export default function Payroll() {
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState("");
  const [month, setMonth] = useState(() => indiaToday().slice(0, 7));
  const [page, setPage] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const companies = useQuery({ queryKey: ["payroll-companies"], queryFn: () => apiGet<PayrollCompany[]>("/admin/payroll/companies") });
  const draft = useQuery({ queryKey: ["payroll-draft", companyId, month], queryFn: () => apiGet<PayrollDraft>(`/admin/payroll/draft?company_id=${encodeURIComponent(companyId)}&month=${month}`), enabled: !!companyId, refetchOnWindowFocus: false });
  const history = useQuery({ queryKey: ["payroll-history", companyId, page], queryFn: () => apiGet<PayrollPage>(`/admin/payroll?page=${page}${companyId ? `&company_id=${encodeURIComponent(companyId)}` : ""}`) });
  const remove = useMutation({
    mutationFn: (record: PayrollSummary) => apiDelete<void>(`/admin/payroll/${record.id}?${new URLSearchParams({ revision: String(record.revision), updated_at: record.updated_at })}`),
    onSuccess: async (_, record) => {
      if (record.company_id === companyId && record.month === month) {
        setCompanyId(""); setDirty(false); setEditorVersion((value) => value + 1); setPage(1);
      } else if (page > 1 && history.data?.items.length === 1 && history.data.items[0].id === record.id) setPage(page - 1);
      const key = ["payroll-draft", record.company_id, record.month];
      await qc.cancelQueries({ queryKey: key, exact: true });
      qc.removeQueries({ queryKey: key, exact: true });
      void qc.invalidateQueries({ queryKey: ["payroll-history"] });
      void qc.invalidateQueries({ queryKey: ["payroll-companies"] });
      toast.success(`Payroll for ${record.company_name} · ${monthLabel(record.month)} deleted`);
    },
    onError: (error) => { void qc.invalidateQueries({ queryKey: ["payroll-history"] }); toast.error(payrollError(error)); },
  });
  const working = busy || remove.isPending;
  const confirmDelete = (record: PayrollSummary) => {
    if (working) return;
    const unsaved = dirty && companyId === record.company_id && month === record.month ? " Unsaved changes to this payroll will also be discarded." : "";
    if (window.confirm(`Permanently delete saved payroll for ${record.company_name} — ${monthLabel(record.month)}? This cannot be undone.${unsaved}`)) remove.mutate(record);
  };
  const discard = () => !dirty || window.confirm("Discard the unsaved payroll changes?");
  const reload = async () => {
    if (working || !discard()) return;
    const response = await draft.refetch();
    if (!response.isError) { setDirty(false); setEditorVersion((value) => value + 1); }
  };
  const open = async (company: string, period: string) => {
    if (working || !discard()) return;
    setDirty(false);
    if (companyId === company && month === period) { const response = await draft.refetch(); if (!response.isError) setEditorVersion((value) => value + 1); }
    else { setCompanyId(company); setMonth(period); setEditorVersion((value) => value + 1); }
  };
  const download = async (record: { id: string; month: string }, format: "pdf" | "xlsx") => {
    try { await downloadPayroll(record, format); } catch (error) { toast.error(payrollError(error)); }
  };

  return <section className="payroll-layout space-y-6 text-[#0F2444]" data-testid="payroll-panel">
    <div><h1 className="text-2xl font-bold">Payroll</h1><p className="mt-1 text-sm text-slate-600">Manage company payroll, review employee details and download your monthly register.</p></div>
    <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-[minmax(0,1fr)_14rem]">
      <div><Label htmlFor="payroll-company" className="mb-2 flex items-center gap-2"><Building2 className="h-4 w-4" /> Company</Label><select id="payroll-company" className={selectStyle} disabled={working || companies.isPending} value={companyId} onChange={(event) => {
        if (!discard()) return;
        setDirty(false); setCompanyId(event.target.value); setPage(1); setEditorVersion((value) => value + 1);
      }} data-testid="payroll-company"><option value="">Select a company</option>{companies.data?.map((company) => <option key={company.id} value={company.id}>{company.name}{company.saved_only ? " (saved payroll)" : ""}</option>)}</select></div>
      <div><Label htmlFor="payroll-month" className="mb-2 block">Payroll month</Label><Input id="payroll-month" type="month" value={month} disabled={working} onChange={(event) => {
        if (!event.target.value || !discard()) return;
        setDirty(false); setMonth(event.target.value); setEditorVersion((value) => value + 1);
      }} data-testid="payroll-month" /></div>
      {companies.isError && <div className="text-sm text-red-700 sm:col-span-2" role="alert">Could not load companies. <Button type="button" variant="outline" size="sm" onClick={() => companies.refetch()}>Try again</Button></div>}
      {!companies.isPending && !companies.isError && !companies.data?.length && <p className="text-sm text-slate-600 sm:col-span-2">Add a company and its employees in Company Workforce first.</p>}
    </div>
    {!companyId ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">Select a company to load its employees and payroll.</div>
      : draft.isPending ? <p role="status" className="flex items-center gap-2 p-6"><Loader2 className="h-4 w-4 animate-spin" />Loading payroll…</p>
      : draft.isError ? <div role="alert" className="rounded-xl border border-red-200 bg-white p-5"><p>{payrollError(draft.error)}</p><Button type="button" variant="outline" className="mt-3" onClick={() => draft.refetch()}>Try again</Button></div>
      : draft.data && <PayrollEditor key={`${companyId}-${month}-${editorVersion}`} draft={draft.data} month={month} deleting={remove.isPending} onDirty={setDirty} onBusy={setBusy} onReload={reload} />}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <h2 className="border-b px-5 py-4 text-lg font-semibold">Saved payroll</h2>
      {history.isPending ? <p className="p-5" role="status">Loading saved payroll…</p>
        : history.isError ? <div role="alert" className="p-5"><p>Saved payroll could not be loaded.</p><Button type="button" variant="outline" className="mt-3" onClick={() => history.refetch()}>Try again</Button></div>
        : !history.data?.items.length ? <p className="p-5 text-sm text-slate-600">No saved payroll for {companyId ? "this company" : "your companies"} yet.</p>
        : <div className="divide-y">{history.data.items.map((record) => <div key={record.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div><p className="font-semibold">{record.company_name}</p><p className="mt-1 text-sm text-slate-600">{monthLabel(record.month)} · {record.totals.employee_count} employees · Payable {rupees(record.totals.payable)}</p></div>
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={working} onClick={() => void open(record.company_id, record.month)}>Open</Button><Button type="button" variant="outline" size="sm" disabled={working} onClick={() => void download(record, "pdf")}><Download className="h-4 w-4" />PDF</Button><Button type="button" variant="outline" size="sm" disabled={working} onClick={() => void download(record, "xlsx")}><FileSpreadsheet className="h-4 w-4" />Excel</Button><Button type="button" variant="outline" size="sm" className="border-red-200 text-red-700 hover:bg-red-50" disabled={working} onClick={() => confirmDelete(record)} aria-label={`Delete payroll for ${record.company_name}, ${monthLabel(record.month)}`} data-testid={`payroll-delete-${record.id}`}>{remove.isPending && remove.variables?.id === record.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Delete</Button></div>
        </div>)}</div>}
      {history.data && history.data.total > history.data.page_size && <div className="flex items-center justify-between border-t p-4"><Button type="button" variant="outline" disabled={working || page === 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><span className="text-sm">Page {page} of {Math.ceil(history.data.total / history.data.page_size)}</span><Button type="button" variant="outline" disabled={working || page * history.data.page_size >= history.data.total} onClick={() => setPage((value) => value + 1)}>Next</Button></div>}
    </div>
  </section>;
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Download, FileSpreadsheet, Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPost } from "@/lib/api";
import { indiaToday, monthLabel, rupees } from "@/lib/finance";
import { downloadPayroll, payrollError, payrollRows, type PayrollAmounts, type PayrollCompany, type PayrollDraft, type PayrollInput, type PayrollPage, type PayrollRecord, type PayrollTotals } from "@/lib/payroll";

const orange = "bg-[#C2410C] text-white hover:bg-[#9A3412]";
const selectStyle = "h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50";

export default function Payroll() {
  const [companyId, setCompanyId] = useState("");
  const [month, setMonth] = useState(() => indiaToday().slice(0, 7));
  const [page, setPage] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const companies = useQuery({ queryKey: ["payroll-companies"], queryFn: () => apiGet<PayrollCompany[]>("/admin/payroll/companies") });
  const draft = useQuery({ queryKey: ["payroll-draft", companyId, month], queryFn: () => apiGet<PayrollDraft>(`/admin/payroll/draft?company_id=${encodeURIComponent(companyId)}&month=${month}`), enabled: !!companyId, refetchOnWindowFocus: false });
  const history = useQuery({ queryKey: ["payroll-history", companyId, page], queryFn: () => apiGet<PayrollPage>(`/admin/payroll?page=${page}${companyId ? `&company_id=${encodeURIComponent(companyId)}` : ""}`) });
  const discard = () => !dirty || window.confirm("Discard the unsaved payroll changes?");
  const reload = async () => {
    if (busy || !discard()) return;
    const response = await draft.refetch();
    if (!response.isError) { setDirty(false); setEditorVersion((value) => value + 1); }
  };
  const open = async (company: string, period: string) => {
    if (busy || !discard()) return;
    setDirty(false);
    if (companyId === company && month === period) { const response = await draft.refetch(); if (!response.isError) setEditorVersion((value) => value + 1); }
    else { setCompanyId(company); setMonth(period); setEditorVersion((value) => value + 1); }
  };
  const download = async (record: { id: string; month: string }, format: "pdf" | "xlsx") => {
    try { await downloadPayroll(record, format); } catch (error) { toast.error(payrollError(error)); }
  };

  return <section className="space-y-6 text-[#0F2444]" data-testid="payroll-panel">
    <div><h1 className="text-2xl font-bold">Payroll</h1><p className="mt-1 text-sm text-slate-600">Calculate company payroll from your workforce roster, then save the month and download your register.</p></div>
    <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-[minmax(0,1fr)_14rem]">
      <div><Label htmlFor="payroll-company" className="mb-2 flex items-center gap-2"><Building2 className="h-4 w-4" /> Company</Label><select id="payroll-company" className={selectStyle} disabled={busy || companies.isPending} value={companyId} onChange={(event) => {
        if (!discard()) return;
        setDirty(false); setCompanyId(event.target.value); setPage(1); setEditorVersion((value) => value + 1);
      }} data-testid="payroll-company"><option value="">Select a company</option>{companies.data?.map((company) => <option key={company.id} value={company.id}>{company.name}{company.saved_only ? " (saved payroll)" : ""}</option>)}</select></div>
      <div><Label htmlFor="payroll-month" className="mb-2 block">Payroll month</Label><Input id="payroll-month" type="month" value={month} disabled={busy} onChange={(event) => {
        if (!event.target.value || !discard()) return;
        setDirty(false); setMonth(event.target.value); setEditorVersion((value) => value + 1);
      }} data-testid="payroll-month" /></div>
      {companies.isError && <div className="text-sm text-red-700 sm:col-span-2" role="alert">Could not load companies. <Button type="button" variant="outline" size="sm" onClick={() => companies.refetch()}>Try again</Button></div>}
      {!companies.isPending && !companies.isError && !companies.data?.length && <p className="text-sm text-slate-600 sm:col-span-2">Add a company and its employees in Company Workforce first.</p>}
    </div>
    {!companyId ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">Select a company to load its employees and payroll.</div>
      : draft.isPending ? <p role="status" className="flex items-center gap-2 p-6"><Loader2 className="h-4 w-4 animate-spin" />Loading payroll…</p>
      : draft.isError ? <div role="alert" className="rounded-xl border border-red-200 bg-white p-5"><p>{payrollError(draft.error)}</p><Button type="button" variant="outline" className="mt-3" onClick={() => draft.refetch()}>Try again</Button></div>
      : draft.data && <PayrollEditor key={`${companyId}-${month}-${editorVersion}`} draft={draft.data} month={month} onDirty={setDirty} onBusy={setBusy} onReload={reload} />}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <h2 className="border-b px-5 py-4 text-lg font-semibold">Saved payroll</h2>
      {history.isPending ? <p className="p-5" role="status">Loading saved payroll…</p>
        : history.isError ? <div role="alert" className="p-5"><p>Saved payroll could not be loaded.</p><Button type="button" variant="outline" className="mt-3" onClick={() => history.refetch()}>Try again</Button></div>
        : !history.data?.items.length ? <p className="p-5 text-sm text-slate-600">No saved payroll for {companyId ? "this company" : "your companies"} yet.</p>
        : <div className="divide-y">{history.data.items.map((record) => <div key={record.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div><p className="font-semibold">{record.company_name}</p><p className="mt-1 text-sm text-slate-600">{monthLabel(record.month)} · {record.totals.employee_count} employees · Payable {rupees(record.totals.payable)}</p></div>
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void open(record.company_id, record.month)}>Open</Button><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void download(record, "pdf")}><Download className="h-4 w-4" />PDF</Button><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void download(record, "xlsx")}><FileSpreadsheet className="h-4 w-4" />Excel</Button></div>
        </div>)}</div>}
      {history.data && history.data.total > history.data.page_size && <div className="flex items-center justify-between border-t p-4"><Button type="button" variant="outline" disabled={busy || page === 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><span className="text-sm">Page {page} of {Math.ceil(history.data.total / history.data.page_size)}</span><Button type="button" variant="outline" disabled={busy || page * history.data.page_size >= history.data.total} onClick={() => setPage((value) => value + 1)}>Next</Button></div>}
    </div>
  </section>;
}

function PayrollEditor({ draft, month, onDirty, onBusy, onReload }: { draft: PayrollDraft; month: string; onDirty: (value: boolean) => void; onBusy: (value: boolean) => void; onReload: () => Promise<void> }) {
  const qc = useQueryClient();
  const form = useRef<HTMLFormElement>(null);
  const [rows, setRows] = useState(() => payrollRows(draft));
  const [saved, setSaved] = useState(draft.payroll);
  const [notes, setNotes] = useState(draft.payroll?.notes ?? "");
  const [dirty, setDirty] = useState(false);
  const [problem, setProblem] = useState("");
  const [bulk, setBulk] = useState({ worked_days: "", daily_rate: "", esi_percentage: "", pf_percentage: "" });
  const monthDays = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  const payload = useMemo<PayrollInput>(() => ({ company_id: draft.company.id, month, notes, lines: rows.filter((row) => row.selected).map((row) => ({ assignment_id: row.assignment_id, worked_days: row.worked_days || "0", daily_rate: row.daily_rate || "0", esi_percentage: row.esi_percentage || "0", pf_percentage: row.pf_percentage || "0" })) }), [draft.company.id, month, notes, rows]);
  const [previewInput, setPreviewInput] = useState(payload);
  useEffect(() => { const timer = window.setTimeout(() => setPreviewInput(payload), 250); return () => window.clearTimeout(timer); }, [payload]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const preview = useQuery({ queryKey: ["payroll-preview", previewInput], queryFn: () => apiPost<{ lines: PayrollAmounts[]; totals: PayrollTotals }>("/admin/payroll/preview", previewInput), retry: false });
  const current = JSON.stringify(previewInput) === JSON.stringify(payload);
  const totals = current ? preview.data?.totals : undefined;
  const calculated = new Map((current ? preview.data?.lines ?? [] : []).map((row) => [row.assignment_id, row]));
  const change = () => { setDirty(true); onDirty(true); setProblem(""); };
  const editRow = (id: string, field: "selected" | "worked_days" | "daily_rate" | "esi_percentage" | "pf_percentage", value: string | boolean) => { setRows((items) => items.map((row) => row.assignment_id === id ? { ...row, [field]: value } : row)); change(); };
  const save = useMutation({
    mutationFn: async (format?: "pdf" | "xlsx") => {
      if (saved && !dirty && format) { await downloadPayroll(saved, format); return saved; }
      const record = await apiPost<PayrollRecord>("/admin/payroll", { ...payload, revision: saved?.revision ?? null });
      setSaved(record); setDirty(false); onDirty(false); setProblem("");
      const byId = new Map(record.lines.map((line) => [line.assignment_id, line]));
      setRows((items) => items.map((row) => byId.has(row.assignment_id) ? { ...row, ...byId.get(row.assignment_id)! } : row));
      qc.setQueryData<PayrollDraft>(["payroll-draft", draft.company.id, month], (value) => value ? { ...value, payroll: record } : value);
      void qc.invalidateQueries({ queryKey: ["payroll-history"] });
      void qc.invalidateQueries({ queryKey: ["payroll-companies"] });
      if (format) await downloadPayroll(record, format);
      return record;
    },
    onSuccess: () => toast.success("Payroll saved"),
    onError: (error) => { const message = payrollError(error); setProblem(message); toast.error(message); },
    onSettled: () => onBusy(false),
  });
  const startSave = (format?: "pdf" | "xlsx") => {
    if (!(saved && !dirty && format) && !form.current?.reportValidity()) return;
    onBusy(true); save.mutate(format);
  };
  const applyBulk = () => {
    const values = Object.entries(bulk).filter(([, value]) => value !== "");
    for (const [field, value] of values) {
      const amount = Number(value), maximum = field === "worked_days" ? monthDays : field === "daily_rate" ? 1000000000 : 100;
      if (!Number.isFinite(amount) || amount < 0 || amount > maximum || !/^\d+(\.\d{1,2})?$/.test(value)) { toast.error(`Enter a valid ${field.replaceAll("_", " ")} between 0 and ${maximum}`); return; }
    }
    setRows((items) => items.map((row) => row.selected ? { ...row, ...Object.fromEntries(values) } : row)); change();
  };
  const selected = rows.filter((row) => row.selected).length;

  return <div className="space-y-5" data-testid="payroll-editor">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{draft.company.name} · {monthLabel(month)}</h2><p className="mt-1 text-xs text-slate-500">{selected} selected employees{saved ? " · Saved payroll" : " · New payroll"}{dirty && " · Unsaved changes"}</p></div><Button type="button" variant="outline" disabled={save.isPending} onClick={() => void onReload()}><RotateCcw className="h-4 w-4" />Reload payroll</Button></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-live="polite">{[["Gross wages", totals?.gross_wages], ["ESI deduction", totals?.esi_deduction], ["PF deduction", totals?.pf_deduction], ["Payable amount", totals?.payable]].map(([label, value], index) => <div key={label} className={`rounded-xl p-5 ${index === 3 ? "bg-[#0F2444] text-white" : "border border-slate-200 bg-white"}`}><p className={`text-sm ${index === 3 ? "text-slate-200" : "text-slate-600"}`}>{label}</p><p className="mt-2 break-words text-2xl font-bold" data-testid={`payroll-total-${index}`}>{value ? rupees(value) : "Calculating…"}</p></div>)}</div>
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="font-semibold">Apply values to selected employees</h3><p className="mt-1 text-xs text-slate-500">Fill the values you want to apply. You can still edit each employee below.</p>
      <div className="mt-4 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">{([['worked_days', 'Worked days', monthDays], ['daily_rate', 'Daily rate (₹)', 1000000000], ['esi_percentage', 'ESI (%)', 100], ['pf_percentage', 'PF (%)', 100]] as const).map(([key, label, maximum]) => <div key={key}><Label htmlFor={`payroll-bulk-${key}`} className="mb-2 block">{label}</Label><Input id={`payroll-bulk-${key}`} type="number" min="0" max={maximum} step="0.01" inputMode="decimal" value={bulk[key]} disabled={save.isPending} onChange={(event) => setBulk({ ...bulk, [key]: event.target.value })} placeholder="Leave unchanged" /></div>)}<Button type="button" variant="outline" disabled={save.isPending || !selected || Object.values(bulk).every((value) => value === "")} onClick={applyBulk}>Apply to selected</Button></div>
    </div>
    <form ref={form} onSubmit={(event) => { event.preventDefault(); startSave(); }} className="space-y-5">
      <fieldset disabled={save.isPending} className="min-w-0 space-y-5">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b p-5"><h3 className="font-semibold">Employee payroll</h3><p className="mt-1 text-xs text-slate-500">Gross wages = worked days × daily rate. ESI and PF are each deducted from gross wages using the percentages you enter. Completed employees can be selected when needed.</p></div>
          {!rows.length ? <p className="p-5 text-sm text-slate-600">Add employees to this company in Company Workforce, then reload payroll.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[1280px] text-left text-sm" data-testid="payroll-table"><thead className="bg-slate-50 text-slate-600"><tr><th scope="col" className="p-3"><input type="checkbox" aria-label="Select all employees" checked={rows.length > 0 && selected === rows.length} onChange={(event) => { setRows((items) => items.map((row) => ({ ...row, selected: event.target.checked }))); change(); }} /></th><th scope="col" className="min-w-56 p-3">Employee</th><th scope="col" className="w-28 p-3 text-center">Worked days</th><th scope="col" className="w-32 p-3">Daily rate (₹)</th><th scope="col" className="p-3">Gross wages</th><th scope="col" className="w-24 p-3">ESI (%)</th><th scope="col" className="p-3">ESI deduction</th><th scope="col" className="w-24 p-3">PF (%)</th><th scope="col" className="p-3">PF deduction</th><th scope="col" className="p-3">Payable</th></tr></thead><tbody>{rows.map((row) => {
            const result = calculated.get(row.assignment_id);
            return <tr key={row.assignment_id} className={`border-t align-top ${row.selected ? "" : "bg-slate-50 text-slate-500"}`}><td className="p-3"><input type="checkbox" checked={row.selected} aria-label={`Include ${row.full_name} in payroll`} onChange={(event) => editRow(row.assignment_id, "selected", event.target.checked)} /></td><th scope="row" className="p-3 text-left font-normal"><p className="font-semibold">{row.full_name}</p><p className="mt-1 text-xs text-slate-500">ID: {row.employee_id || "Not set"}{row.role ? ` · ${row.role}` : ""}{row.status === "Completed" && " · Completed"}</p><p className="mt-1 text-xs text-slate-500">{row.salary === null ? "No salary on file" : `${rupees(row.salary)} per ${row.salary_basis === "Daily" ? "day" : "month"} on file`}</p></th><td className="p-3"><Input type="number" inputMode="decimal" min="0" max={monthDays} step="0.01" className="text-center tabular-nums" required={row.selected} disabled={!row.selected} value={row.worked_days} aria-label={`Worked days for ${row.full_name}`} onChange={(event) => editRow(row.assignment_id, "worked_days", event.target.value)} data-testid={`payroll-days-${row.assignment_id}`} /></td><td className="p-3"><Input type="number" inputMode="decimal" min={Number(row.worked_days) > 0 ? "0.01" : "0"} max="1000000000" step="0.01" required={row.selected && Number(row.worked_days) > 0} disabled={!row.selected} value={row.daily_rate} aria-label={`Daily rate for ${row.full_name}`} onChange={(event) => editRow(row.assignment_id, "daily_rate", event.target.value)} data-testid={`payroll-rate-${row.assignment_id}`} /></td><td className="whitespace-nowrap p-3 tabular-nums">{result ? rupees(result.gross_wages) : "—"}</td><td className="p-3"><Input type="number" inputMode="decimal" min="0" max="100" step="0.01" required={row.selected} disabled={!row.selected} value={row.esi_percentage} aria-label={`ESI percentage for ${row.full_name}`} onChange={(event) => editRow(row.assignment_id, "esi_percentage", event.target.value)} data-testid={`payroll-esi-${row.assignment_id}`} /></td><td className="whitespace-nowrap p-3 tabular-nums">{result ? rupees(result.esi_deduction) : "—"}</td><td className="p-3"><Input type="number" inputMode="decimal" min="0" max="100" step="0.01" required={row.selected} disabled={!row.selected} value={row.pf_percentage} aria-label={`PF percentage for ${row.full_name}`} onChange={(event) => editRow(row.assignment_id, "pf_percentage", event.target.value)} data-testid={`payroll-pf-${row.assignment_id}`} /></td><td className="whitespace-nowrap p-3 tabular-nums">{result ? rupees(result.pf_deduction) : "—"}</td><td className="whitespace-nowrap p-3 font-semibold tabular-nums">{result ? rupees(result.payable) : "—"}</td></tr>;
          })}</tbody></table></div>}
        </div>
        {current && preview.isError && <p role="alert" className="text-sm text-red-700">{payrollError(preview.error)}</p>}
        <div className="rounded-xl border border-slate-200 bg-white p-5"><Label htmlFor="payroll-notes" className="mb-2 block">Payroll notes (optional)</Label><Textarea id="payroll-notes" maxLength={1000} value={notes} onChange={(event) => { setNotes(event.target.value); change(); }} placeholder="Notes to include in the register" /></div>
        {problem && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"><p>{problem}</p><Button type="button" variant="outline" className="mt-3" onClick={() => void onReload()}>Reload saved payroll</Button></div>}
        <div className="flex flex-wrap gap-3"><Button type="submit" className={orange} disabled={!selected || (!!saved && !dirty)} data-testid="payroll-save">{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save payroll</Button><Button type="button" variant="outline" disabled={!selected} onClick={() => startSave("pdf")} data-testid="payroll-pdf"><Download className="h-4 w-4" />{saved && !dirty ? "Download PDF" : "Save & download PDF"}</Button><Button type="button" variant="outline" disabled={!selected} onClick={() => startSave("xlsx")} data-testid="payroll-excel"><FileSpreadsheet className="h-4 w-4" />{saved && !dirty ? "Download Excel" : "Save & download Excel"}</Button></div>
      </fieldset>
    </form>
  </div>;
}

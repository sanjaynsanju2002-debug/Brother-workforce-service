import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ChevronDown, Download, FileSpreadsheet, Loader2, RotateCcw, Save, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPost } from "@/lib/api";
import { monthLabel, rupees } from "@/lib/finance";
import { downloadPayroll, firstPayrollIssue, payrollDeductionTotal, payrollError, payrollRows, type PayrollAmounts, type PayrollDraft, type PayrollInput, type PayrollIssue, type PayrollRecord, type PayrollRow, type PayrollTotals, type PayrollValueField } from "@/lib/payroll";

import { OPS, downloadPrivate, operationError, type AttendanceSummary } from "@/lib/operations";

import { selectClass } from "@/lib/operations";

type Props = {
  draft: PayrollDraft;
  month: string;
  deleting: boolean;
  onDirty: (value: boolean) => void;
  onBusy: (value: boolean) => void;
  onReload: () => Promise<void>;
};

export default function PayrollEditor({ draft, month, deleting, onDirty, onBusy, onReload }: Props) {
  const qc = useQueryClient();
  const register = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [rows, setRows] = useState(() => payrollRows(draft));
  const [activeId, setActiveId] = useState(() => rows.find((row) => row.selected)?.assignment_id ?? rows[0]?.assignment_id ?? "");
  const [saved, setSaved] = useState(draft.payroll);
  const [notes, setNotes] = useState(draft.payroll?.notes ?? "");
  const [dirty, setDirty] = useState(false);
  const [attendanceRefs, setAttendanceRefs] = useState<Record<string, number>>(draft.payroll?.attendance_refs ?? {});
  const [responsibility, setResponsibility] = useState<"Agency" | "Client">(draft.payroll?.cost_responsibility ?? "Agency");
  const [problem, setProblem] = useState("");
  const [issue, setIssue] = useState<PayrollIssue>();
  const [bulk, setBulk] = useState({ worked_days: "", daily_rate: "", esi_percentage: "", pf_percentage: "" });
  const monthDays = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  const payload = useMemo<PayrollInput>(() => ({
    company_id: draft.company.id, month, notes, cost_responsibility: responsibility, attendance_refs: attendanceRefs,
    lines: rows.filter((row) => row.selected).map((row) => ({
      assignment_id: row.assignment_id, worked_days: row.worked_days || "0", daily_rate: row.daily_rate || "0",
      esi_percentage: row.esi_percentage || "0", pf_percentage: row.pf_percentage || "0", overtime_hours: row.overtime_hours || "0", overtime_rate: row.overtime_rate || "0",
    })),
  }), [draft.company.id, month, notes, rows, responsibility, attendanceRefs]);
  const [previewInput, setPreviewInput] = useState(payload);
  useEffect(() => {
    const timer = window.setTimeout(() => setPreviewInput(payload), 250);
    return () => window.clearTimeout(timer);
  }, [payload]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const preview = useQuery({
    queryKey: ["payroll-preview", previewInput],
    queryFn: () => apiPost<{ lines: PayrollAmounts[]; totals: PayrollTotals }>("/admin/payroll/preview", previewInput),
    retry: false,
  });
  const current = JSON.stringify(previewInput) === JSON.stringify(payload);
  const totals = current ? preview.data?.totals : undefined;
  const calculated = new Map((current ? preview.data?.lines ?? [] : []).map((row) => [row.assignment_id, row]));
  const selected = rows.filter((row) => row.selected).length;
  const active = rows.find((row) => row.assignment_id === activeId) ?? rows[0];
  const activeIndex = active ? rows.findIndex((row) => row.assignment_id === active.assignment_id) : -1;
  const change = () => { setDirty(true); onDirty(true); setProblem(""); setIssue(undefined); };
  const editRow = (id: string, field: PayrollValueField | "selected", value: string | boolean) => {
    setRows((items) => items.map((row) => row.assignment_id === id ? { ...row, [field]: value } : row));
    change();
  };
  const showEmployee = (id: string, scroll = false) => {
    setActiveId(id);
    if (scroll) window.requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };
  const focusIssue = (next: PayrollIssue) => {
    setIssue(next); setProblem(next.message); setActiveId(next.assignment_id);
    window.requestAnimationFrame(() => {
      panel.current?.querySelector<HTMLInputElement>(`[name="${next.field}"]`)?.focus({ preventScroll: true });
      panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };
  const save = useMutation({
    mutationFn: async (format?: "pdf" | "xlsx") => {
      if (saved && !dirty && format) { await downloadPayroll(saved, format); return saved; }
      const record = await apiPost<PayrollRecord>("/admin/payroll", {
        ...payload, revision: saved?.revision ?? null, created_at: saved?.created_at ?? null,
      });
      setSaved(record); setDirty(false); onDirty(false); setProblem(""); setIssue(undefined);
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
  const attendanceImport = useMutation({
    mutationFn: () => apiGet<AttendanceSummary>(`${OPS}/attendance-summary?company_id=${draft.company.id}&month=${month}`),
    onSuccess: (summary) => {
      if (!summary.approved_days) { setProblem("No payroll-ready attendance exists for this company and month. Approve a day or have an employee complete check-out first."); return; }
      const unknown = summary.lines.filter((line) => !rows.some((r) => r.assignment_id === line.assignment_id));
      if (unknown.length) { setProblem("Payroll-ready attendance includes an employee no longer in this payroll draft. Reload payroll and review Company Workforce before importing."); return; }
      if (!window.confirm(`Import ${summary.approved_days} payroll-ready attendance dates for this month? Worked days and overtime will replace the current values. Review the covered dates and rates before saving.`)) return;
      const byId = new Map(summary.lines.map((line) => [line.assignment_id, line]));
      setRows((items) => items.map((r) => ({ ...r, selected: byId.has(r.assignment_id), worked_days: byId.get(r.assignment_id)?.worked_days ?? "0", overtime_hours: byId.get(r.assignment_id)?.overtime_hours ?? "0" })));
      setAttendanceRefs(Object.fromEntries(summary.sheets.map((s) => [s.id, s.revision]))); change();
      toast.success(`Imported ${summary.approved_days} payroll-ready days. Review daily and overtime rates.`);
    }, onError: (e) => setProblem(operationError(e)),
  });
  const linkedAttendance = Object.keys(attendanceRefs).length;
  const coverage = useQuery({ queryKey: ["ops", "attendance-coverage", draft.company.id, month], queryFn: () => apiGet<AttendanceSummary>(`${OPS}/attendance-summary?company_id=${draft.company.id}&month=${month}`), enabled: linkedAttendance > 0 });
  const locked = deleting || save.isPending || attendanceImport.isPending;
  const startSave = (format?: "pdf" | "xlsx") => {
    if (locked) return;
    if (!(saved && !dirty && format)) {
      if (!selected) { setProblem("Select at least one employee to include in payroll."); return; }
      const next = firstPayrollIssue(rows, monthDays);
      if (next) { focusIssue(next); return; }
    }
    onBusy(true); save.mutate(format);
  };
  const applyBulk = () => {
    const values = Object.entries(bulk).filter(([, value]) => value !== "");
    if (linkedAttendance && bulk.worked_days) { toast.error("Choose manual attendance before changing imported worked days."); return; }
    for (const [field, value] of values) {
      const amount = Number(value), maximum = field === "worked_days" ? monthDays : field === "daily_rate" ? 1_000_000_000 : 100;
      if (!Number.isFinite(amount) || amount < 0 || amount > maximum || !/^(?:\d+|\d*\.\d{1,2})$/.test(value)) {
        toast.error(`Enter a valid ${field.replaceAll("_", " ")} between 0 and ${maximum}`); return;
      }
    }
    setRows((items) => items.map((row) => row.selected ? { ...row, ...Object.fromEntries(values) } : row));
    change(); toast.success(`Values applied to ${selected} employees`);
  };

  return <div className="space-y-5" data-testid="payroll-editor">
    <form noValidate onSubmit={(event) => { event.preventDefault(); startSave(); }}>
      <fieldset disabled={locked} className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="break-words text-lg font-semibold">{draft.company.name} · {monthLabel(month)}</h2>
            <p className="mt-1 text-xs text-slate-500">{selected} included employees · {saved ? "Saved payroll" : "New payroll"}{dirty && " · Unsaved changes"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void onReload()} aria-label="Reload payroll"><RotateCcw className="h-4 w-4" /></Button>
            <Button type="button" variant="outline" disabled={!selected} aria-label={saved && !dirty ? "Download payroll PDF" : "Save payroll and download PDF"} onClick={() => startSave("pdf")} data-testid="payroll-pdf"><Download className="h-4 w-4" />PDF</Button>
            <Button type="button" variant="outline" disabled={!selected} aria-label={saved && !dirty ? "Download payroll Excel" : "Save payroll and download Excel"} onClick={() => startSave("xlsx")} data-testid="payroll-excel"><FileSpreadsheet className="h-4 w-4" />Excel</Button>
            <Button type="submit" className="bg-[#C2410C] text-white hover:bg-[#9A3412]" disabled={!selected || (!!saved && !dirty)} data-testid="payroll-save">{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save payroll</Button>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid items-end gap-4 sm:grid-cols-2"><div><Label htmlFor="payroll-responsibility" className="mb-2 block">Who pays these salaries?</Label><select id="payroll-responsibility" className={selectClass} value={responsibility} onChange={(e) => { setResponsibility(e.target.value as "Agency" | "Client"); change(); }}><option value="Agency">Agency pays salaries</option><option value="Client">Client pays directly (reference payroll)</option></select></div><Button type="button" variant="outline" disabled={locked || !rows.length} onClick={() => attendanceImport.mutate()}>Import payroll-ready attendance</Button></div>
          {linkedAttendance ? <div className="space-y-2 text-xs text-slate-600"><p>Linked to {linkedAttendance} payroll-ready attendance dates. Days and overtime hours are locked to those records.</p><details><summary className="cursor-pointer">Review covered dates</summary><p className="mt-2">{coverage.isPending ? "Loading covered dates…" : coverage.isError ? "Could not load dates. Import attendance again to review." : coverage.data?.sheets.filter((s) => s.id in attendanceRefs).map((s) => s.date).join(", ") || "Attendance records changed. Import attendance again."}</p><p className="mt-2">References are checked again when payroll is saved. Import again after attendance changes.</p></details><Button type="button" variant="outline" size="sm" onClick={() => { setAttendanceRefs({}); change(); }}>Use manual attendance</Button></div> : <p className="text-xs text-slate-500">Manual worked days. Import owner-approved days and completed employee check-outs to fill days and overtime hours. Enter the hourly overtime rate yourself. Client-paid registers are excluded from agency salary balances and company payroll costs.</p>}
        </div>

        <div className="payroll-metrics" aria-live="polite">
          <Metric label="Employees" value={String(selected)} testId="payroll-employee-count" />
          <Metric label="Gross wages" value={totals ? rupees(totals.gross_wages) : "—"} testId="payroll-total-0" />
          <Metric label="ESI + PF deductions" value={totals ? rupees(payrollDeductionTotal(totals)) : "—"} testId="payroll-total-deductions" />
          <Metric label="Total payable" value={totals ? rupees(totals.payable) : "—"} testId="payroll-total-3" primary />
        </div>

        {problem && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>{problem}</p>
          {!issue && <Button type="button" variant="outline" className="mt-3" onClick={() => void onReload()}>Reload saved payroll</Button>}
        </div>}

        <div className="payroll-ledger" data-testid="payroll-ledger">
          <div ref={register} className="payroll-register min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
              <div><h3 className="font-semibold">Employee register</h3><p className="mt-1 text-xs text-slate-500">All amounts in INR</p></div>
              <label className="flex min-h-9 items-center gap-2 text-xs text-slate-600"><input type="checkbox" className="h-4 w-4 shrink-0 accent-[#C2410C]" aria-label="Select all employees" checked={rows.length > 0 && selected === rows.length} disabled={!rows.length} onChange={(event) => { setRows((items) => items.map((row) => ({ ...row, selected: event.target.checked }))); change(); }} />Include all</label>
            </div>
            {!rows.length ? <div className="p-6 text-sm text-slate-600"><Users className="mb-3 h-7 w-7 text-slate-400" /><p>Add employees to this company in Company Workforce, then reload payroll.</p></div>
              : <table className="payroll-register-table" data-testid="payroll-table">
                <colgroup><col style={{ width: "42%" }} /><col style={{ width: "12%" }} /><col style={{ width: "23%" }} /><col style={{ width: "23%" }} /></colgroup>
                <thead><tr>
                  <th scope="col">Employee</th>
                  <th scope="col" className="payroll-days-cell">Days</th><th scope="col">Gross</th><th scope="col">Payable</th>
                </tr></thead>
                <tbody>{rows.map((row) => {
                  const result = calculated.get(row.assignment_id);
                  const isActive = row.assignment_id === active?.assignment_id;
                  return <tr key={row.assignment_id} data-active={isActive} data-included={row.selected}>
                    <th scope="row"><div className="flex items-start gap-3">
                      <label className="inline-flex min-h-7 shrink-0 items-center"><input type="checkbox" className="h-4 w-4 accent-[#C2410C]" checked={row.selected} aria-label={`Include ${row.full_name} in payroll`} onChange={(event) => editRow(row.assignment_id, "selected", event.target.checked)} /></label>
                      <div className="min-w-0"><button type="button" className="min-h-7 break-words text-left font-semibold underline decoration-slate-300 underline-offset-4 hover:text-[#C2410C] focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C2410C]" aria-pressed={isActive} aria-label={`View payroll details for ${row.full_name}`} data-payroll-employee={row.assignment_id} data-testid={`payroll-employee-${row.assignment_id}`} onClick={() => showEmployee(row.assignment_id, true)}>{row.full_name}</button>
                        <p className="mt-1 break-words text-xs font-normal text-slate-500">{row.employee_id || "No employee ID"}{row.status === "Completed" && " · Completed"}</p>
                        {!row.selected && <p className="mt-1 text-xs font-normal text-slate-500">Not included</p>}
                      </div>
                    </div></th>
                    <td className="payroll-days-cell" data-label="Worked days">{row.worked_days || "—"}</td>
                    <td data-label="Gross wages">{result ? rupees(result.gross_wages) : "—"}</td>
                    <td className="payroll-payable-cell" data-label="Payable">{result ? rupees(result.payable) : "—"}</td>
                  </tr>;
                })}</tbody>
                <tfoot><tr><th scope="row">Total · {selected} employees</th><td className="payroll-days-cell" data-label="Worked days">{totals?.worked_days ?? "—"}</td><td data-label="Gross wages">{totals ? rupees(totals.gross_wages) : "—"}</td><td className="payroll-payable-cell" data-label="Payable">{totals ? rupees(totals.payable) : "—"}</td></tr></tfoot>
              </table>}
            {rows.length > 0 && <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200 px-4 py-3 text-xs text-slate-500"><span>ESI {totals ? rupees(totals.esi_deduction) : "—"}</span><span>PF {totals ? rupees(totals.pf_deduction) : "—"}</span></div>}
          </div>

          <section ref={panel} className="payroll-detail-panel min-w-0 rounded-xl border border-slate-200 bg-white p-5" aria-label="Employee payroll details" data-testid="payroll-detail-panel">
            {!active ? <p className="text-sm text-slate-500">Employee details will appear here.</p> : <>
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium uppercase tracking-wider text-slate-500">Employee details</p><span className="text-xs text-slate-500">{activeIndex + 1} of {rows.length}</span></div>
              <h3 className="mt-3 break-words text-lg font-semibold" data-testid="payroll-active-name">{active.full_name}</h3>
              <p className="mt-1 break-words text-xs text-slate-500">{active.employee_id || "No employee ID"}{active.role ? ` · ${active.role}` : ""}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{active.salary === null ? "No salary on file" : `${rupees(active.salary)} per ${active.salary_basis === "Daily" ? "day" : "month"} on file`}</p>
              <label className="mt-4 flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#C2410C]" checked={active.selected} onChange={(event) => editRow(active.assignment_id, "selected", event.target.checked)} />Include in this payroll</label>
              <EmployeeFields row={active} attendanceLinked={!!linkedAttendance} monthDays={monthDays} issue={issue} onChange={(field, value) => editRow(active.assignment_id, field, value)} />
              <p className="mt-3 text-xs leading-relaxed text-slate-500">Gross wages include worked days × daily rate and overtime hours × hourly rate. ESI and PF apply to gross wages at the rates you enter.</p>
              {saved && !dirty && saved.lines.some((r) => r.assignment_id === active.assignment_id) && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void downloadPrivate(`${OPS}/payroll/${saved.id}/payslip/${active.assignment_id}.pdf`, `BWS-Payslip-${month}.pdf`).catch((e) => setProblem(operationError(e)))}>Download employee payslip</Button>}
              <div className="mt-5 space-y-3 border-t border-slate-200 pt-4 text-sm tabular-nums" aria-live="polite">
                {[["Gross wages", calculated.get(active.assignment_id)?.gross_wages], ["ESI deduction", calculated.get(active.assignment_id)?.esi_deduction], ["PF deduction", calculated.get(active.assignment_id)?.pf_deduction]].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-x-3 gap-y-1"><span className="text-slate-500">{label}</span><span>{value ? rupees(value) : "—"}</span></div>)}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-orange-50 p-3"><span className="font-medium">Payable</span><span className="text-lg font-semibold" data-testid="payroll-active-payable">{calculated.has(active.assignment_id) ? rupees(calculated.get(active.assignment_id)!.payable) : "—"}</span></div>
              </div>
              {!active.selected && <p className="mt-3 text-xs text-slate-500">Select “Include in this payroll” to enter this employee’s attendance.</p>}
              <div className="mt-5 flex justify-between gap-2"><Button type="button" variant="outline" size="sm" disabled={activeIndex <= 0} onClick={() => showEmployee(rows[activeIndex - 1].assignment_id)}><ArrowLeft className="h-4 w-4" />Previous</Button><Button type="button" variant="outline" size="sm" disabled={activeIndex >= rows.length - 1} onClick={() => showEmployee(rows[activeIndex + 1].assignment_id)}>Next<ArrowRight className="h-4 w-4" /></Button></div>
              <Button type="button" variant="ghost" size="sm" className="payroll-back-to-register mt-2 w-full text-slate-500" onClick={() => {
                const button = Array.from(register.current?.querySelectorAll<HTMLButtonElement>("[data-payroll-employee]") ?? []).find((item) => item.dataset.payrollEmployee === active.assignment_id);
                button?.focus({ preventScroll: true }); button?.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }}>Back to employee register</Button>
              <p className="mt-4 text-xs leading-relaxed text-slate-500">Changes are included when you save payroll.</p>
            </>}
          </section>
        </div>

        {current && preview.isError && <p role="alert" className="text-sm text-red-700">{payrollError(preview.error)}</p>}
        <div className="rounded-xl border border-slate-200 bg-white p-5"><Label htmlFor="payroll-notes" className="mb-2 block">Payroll notes (optional)</Label><Textarea id="payroll-notes" maxLength={1000} value={notes} onChange={(event) => { setNotes(event.target.value); change(); }} placeholder="Notes to include in the register" /></div>
      </fieldset>
    </form>

    <details className="group rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4 text-sm font-medium [&::-webkit-details-marker]:hidden"><span>Apply values to selected employees</span><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></summary>
      <fieldset disabled={locked} className="min-w-0 border-t border-slate-200 p-5">
        <p className="text-xs text-slate-500">Fill the values you want to apply. Leave a field blank to keep its current value.</p>
        <div className="mt-4 grid items-end gap-3 sm:grid-cols-2">{([
          ["worked_days", "Worked days", monthDays], ["daily_rate", "Daily rate (₹)", 1_000_000_000], ["esi_percentage", "ESI (%)", 100], ["pf_percentage", "PF (%)", 100],
        ] as const).map(([key, label, maximum]) => <div key={key}><Label htmlFor={`payroll-bulk-${key}`} className="mb-2 block">{label}</Label><Input id={`payroll-bulk-${key}`} type="number" min="0" max={maximum} step="0.01" inputMode="decimal" value={bulk[key]} onChange={(event) => setBulk({ ...bulk, [key]: event.target.value })} placeholder="Leave unchanged" /></div>)}</div>
        <Button type="button" variant="outline" className="mt-4" disabled={!selected || Object.values(bulk).every((value) => value === "")} onClick={applyBulk}>Apply to {selected} selected employees</Button>
      </fieldset>
    </details>
  </div>;
}

function Metric({ label, value, testId, primary = false }: { label: string; value: string; testId: string; primary?: boolean }) {
  return <div className={`min-w-0 rounded-xl p-4 ${primary ? "bg-[#0F2444] text-white" : "border border-slate-200 bg-white"}`}><p className={`text-xs leading-relaxed ${primary ? "text-slate-200" : "text-slate-500"}`}>{label}</p><p className="mt-2 break-words text-xl font-semibold tabular-nums" data-testid={testId}>{value}</p></div>;
}

function EmployeeFields({ row, monthDays, attendanceLinked, issue, onChange }: { row: PayrollRow; attendanceLinked: boolean; monthDays: number; issue?: PayrollIssue; onChange: (field: PayrollValueField, value: string) => void }) {
  const fields = [
    { key: "worked_days", label: "Worked days", min: "0", max: monthDays, prefix: "days" },
    { key: "daily_rate", label: "Daily rate (₹)", min: Number(row.worked_days) > 0 ? "0.01" : "0", max: 1_000_000_000, prefix: "rate" },
    { key: "overtime_hours", label: "Overtime hours", min: "0", max: 744, prefix: "ot-hours" },
    { key: "overtime_rate", label: "Overtime hourly rate (₹)", min: "0", max: 1_000_000_000, prefix: "ot-rate" },
    { key: "esi_percentage", label: "ESI (%)", min: "0", max: 100, prefix: "esi" },
    { key: "pf_percentage", label: "PF (%)", min: "0", max: 100, prefix: "pf" },
  ] as const;
  return <div className="mt-4 grid grid-cols-2 gap-4">{fields.map(({ key, label, min, max, prefix }) => {
    const invalid = issue?.assignment_id === row.assignment_id && issue.field === key;
    const id = `payroll-${prefix}-${row.assignment_id}`;
    return <div key={key}><Label htmlFor={id} className="mb-2 block text-xs text-slate-600">{label}</Label><Input id={id} name={key} type="number" inputMode="decimal" min={min} max={max} step="0.01" required={row.selected && (key !== "daily_rate" || Number(row.worked_days) > 0)} disabled={!row.selected || (attendanceLinked && (key === "worked_days" || key === "overtime_hours"))} className={key === "worked_days" ? "text-center tabular-nums" : "tabular-nums"} value={row[key]} onChange={(event) => onChange(key, event.target.value)} aria-invalid={invalid || undefined} aria-label={`${label} for ${row.full_name}`} data-testid={id} /></div>;
  })}</div>;
}

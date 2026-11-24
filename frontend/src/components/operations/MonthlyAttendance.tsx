import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CheckCheck, ChevronDown, LockKeyhole, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { indiaToday } from "@/lib/finance";
import { box, getCompanies, operationError, OPS, selectClass, useOperationsRefresh } from "@/lib/operations";
import { attendanceStatuses, canApproveDay, loadAttendanceMonth, monthDates, statusCode, working, workspaceDay, type AttendanceDraft, type AttendanceRow, type AttendanceSheet, type Status, type WorkspaceDay } from "@/lib/attendanceWorkspace";
import { Field, Heading, Problem, QueryStatus } from "./Common";

const shortDate = (day: string) => `${day.slice(8)}/${day.slice(5, 7)}`;
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" });
const cellStyle = (status: Status) => status === "Present" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : status === "Unmarked" ? "bg-white text-slate-400 border-dashed border-slate-300" : status === "Unpaid leave" || status === "Leave" || status === "Absent" ? "bg-red-50 text-red-800 border-red-200" : "bg-amber-50 text-amber-900 border-amber-200";

export default function MonthlyAttendance({ onPendingChange }: { onPendingChange?: (state: { dirty: boolean; busy: boolean }) => void } = {}) {
  const [company, setCompany] = useState("");
  const [month, setMonth] = useState(indiaToday().slice(0, 7));
  const dirty = useRef(false);
  const pendingListener = useRef(onPendingChange);
  useEffect(() => { pendingListener.current = onPendingChange; }, [onPendingChange]);
  const [working, setWorking] = useState(false);
  const workingRef = useRef(false);
  const updateDirty = (value: boolean) => { dirty.current = value; onPendingChange?.({ dirty: value, busy: workingRef.current }); };
  const updateBusy = (value: boolean) => { workingRef.current = value; setWorking(value); onPendingChange?.({ dirty: dirty.current, busy: value }); };
  const dates = useMemo(() => monthDates(month), [month]);
  const companies = useQuery({ queryKey: ["ops", "companies"], queryFn: getCompanies });
  // Keep this query outside broad payroll invalidations: a partial save must not
  // remount the editor and discard unsaved work on the dates that failed.
  const query = useQuery({ queryKey: ["attendance-workspace", company, month], queryFn: () => loadAttendanceMonth(company, dates), enabled: !!company && dates.length > 0, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false });
  const switchValue = (set: (value: string) => void, value: string) => {
    if (working) return false;
    if (dirty.current && !window.confirm("Discard unsaved attendance changes before switching?")) return false;
    updateDirty(false); set(value);
  };
  useEffect(() => {
    const preventLoss = (event: BeforeUnloadEvent) => { if (dirty.current || workingRef.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", preventLoss);
    return () => { window.removeEventListener("beforeunload", preventLoss); pendingListener.current?.({ dirty: false, busy: false }); };
  }, []);
  return <section className="space-y-5" data-testid="attendance-panel">
    <Heading title="Attendance workspace" text="Catch up on several days in one sheet. Select dates, enter leave, then prepare the remaining unmarked staff as present. Save drafts before approving for payroll." />
    <div className={`${box} grid gap-4 sm:grid-cols-2`}>
      <Field label="Company"><select aria-label="Attendance company" className={selectClass} disabled={working} value={company} onChange={event => switchValue(setCompany, event.target.value)}><option value="">Select company</option>{companies.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Month"><DateInput type="month" aria-label="Attendance month" value={month} disabled={working} required onValueChange={value => value ? switchValue(setMonth, value) : false} /></Field>
    </div>
    <QueryStatus pending={companies.isPending || (!!company && query.isPending)} error={companies.error || query.error} retry={() => { if (workingRef.current) return; void companies.refetch(); if (company && (!dirty.current || window.confirm("Discard unsaved attendance edits and reload?"))) { updateDirty(false); void query.refetch(); } }} />
    {!company && <div className={`${box} flex items-center gap-4 text-slate-600`}><CalendarDays className="size-8 text-orange-600" /><p>Select a company to open its monthly attendance sheet.</p></div>}
    {query.data && !query.isFetching && <MonthEditor key={`${company}:${month}:${query.dataUpdatedAt}`} company={company} dates={dates} initial={query.data} onBusy={updateBusy} onDirty={updateDirty} reload={() => { updateDirty(false); void query.refetch(); }} />}
    {query.isFetching && query.data && <p role="status">Refreshing attendance…</p>}
  </section>;
}

function MonthEditor({ company, dates, initial, onBusy, onDirty, reload }: { company: string; dates: string[]; initial: Record<string, WorkspaceDay>; onBusy: (value: boolean) => void; onDirty: (value: boolean) => void; reload: () => void }) {
  const today = indiaToday();
  const [days, setDays] = useState(initial);
  const [selected, setSelected] = useState<string[]>([]);
  const available = dates.filter(date => date <= today);
  const [from, setFrom] = useState(available.at(-7) ?? dates[0]);
  const [to, setTo] = useState(available.at(-1) ?? dates[0]);
  const [search, setSearch] = useState("");
  const [employee, setEmployee] = useState("");
  const [leaveType, setLeaveType] = useState<Status>("Unpaid leave");
  const [active, setActive] = useState<{ date: string; id: string } | null>(null);
  const [busy, setBusyState] = useState(false);
  const setBusy = (value: boolean) => { setBusyState(value); onBusy(value); };
  const detail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) { detail.current?.focus({ preventScroll: true }); detail.current?.scrollIntoView?.({ behavior: "instant", block: "nearest" }); }
  }, [active]);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  const refresh = useOperationsRefresh();
  const people = useMemo(() => {
    const result = new Map<string, AttendanceRow>();
    for (const date of dates) for (const row of days[date].rows) result.set(row.assignment_id, row);
    return [...result.values()].sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [dates, days]);
  const dayRows = useMemo(() => Object.fromEntries(dates.map(date => [date, new Map(days[date].rows.map(row => [row.assignment_id, row]))])), [dates, days]);
  const visible = people.filter(person => `${person.full_name} ${person.assignment_id} ${person.role}`.toLowerCase().includes(search.toLowerCase()));
  const changed = dates.filter(date => days[date].dirty);
  const approvals = selected.filter(date => canApproveDay(days[date], date, today));
  const blocked = selected.some(date => days[date].rows.length && days[date].sheet?.status !== "Approved" && !canApproveDay(days[date], date, today));
  const approvedCount = dates.filter(date => days[date].sheet?.status === "Approved").length;
  const commit = (next: Record<string, WorkspaceDay>) => { setDays(next); onDirty(Object.values(next).some(day => day.dirty)); };
  const editDay = (date: string, update: (day: WorkspaceDay) => WorkspaceDay) => {
    if (busy || days[date].reloadRequired || days[date].sheet?.status === "Approved" || date > today) return;
    commit({ ...days, [date]: { ...update(days[date]), dirty: true, error: "" } }); setMessage("");
  };
  const editRow = (date: string, id: string, update: Partial<AttendanceRow>) => editDay(date, day => ({ ...day, rows: day.rows.map(row => row.assignment_id === id ? { ...row, ...update } : row) }));
  const apply = (mode: "prepare" | "leave") => {
    let cells = 0; const next = { ...days };
    for (const date of selected) {
      const day = days[date];
      if (day.reloadRequired || day.sheet?.status === "Approved" || date > today) continue;
      let edited = false;
      const rows = day.rows.map(row => {
        if (mode === "prepare" ? row.status !== "Unmarked" : row.assignment_id !== employee) return row;
        const status = mode === "prepare" ? "Present" : leaveType;
        if (row.status === status) return row;
        edited = true; cells++;
        return { ...row, status, ...(!working(status) ? { overtime_hours: "0" } : {}) } as AttendanceRow;
      });
      if (edited) next[date] = { ...day, rows, dirty: true, error: "" };
    }
    commit(next); setProblem(""); setMessage(cells ? `${cells} attendance entries changed. Save drafts when ready.` : "No eligible entries to change. Approved days and employees outside their deployment dates stay unchanged.");
  };
  const save = async () => {
    if (busy || !changed.length) return;
    setBusy(true); setMessage(""); setProblem(""); const next = { ...days }; let saved = 0;
    for (const date of changed) {
      const day = next[date];
      try {
        const sheet = await apiPut<AttendanceSheet>(`${OPS}/attendance`, { company_id: company, attendance_date: date, revision: day.sheet?.revision ?? null, notes: day.notes, rows: day.rows.map(({ assignment_id, status, shift, overtime_hours }) => ({ assignment_id, status, shift, overtime_hours: overtime_hours || "0" })) });
        next[date] = { ...day, sheet, rows: sheet.rows, notes: sheet.notes, dirty: false, error: "" }; saved++;
        try {
          const latest = await apiGet<AttendanceDraft>(`${OPS}/attendance?company_id=${encodeURIComponent(company)}&attendance_date=${date}`);
          next[date] = workspaceDay(latest);
        } catch { next[date] = { ...next[date], error: "Draft saved, but review checks could not refresh. Reload this day before approving." }; }
      } catch (error) { next[date] = { ...day, error: operationError(error) }; }
      commit({ ...next });
    }
    setBusy(false); refresh(); setMessage(`${saved} of ${changed.length} changed days saved. Attendance remains draft until you approve it.`);
    if (saved !== changed.length) setProblem("Some days could not be saved. Your unsaved edits are kept. Open the flagged date to review the error; reload that day if records changed elsewhere.");
  };
  const approve = async () => {
    if (busy || blocked || !approvals.length || !window.confirm(`Approve these ${approvals.length} saved days for payroll? They will be locked until reopened for correction.`)) return;
    setBusy(true); setMessage(""); setProblem(""); const next = { ...days }; let approved = 0;
    for (const date of approvals) {
      const day = next[date];
      try {
        const sheet = await apiPost<AttendanceSheet>(`${OPS}/attendance/${encodeURIComponent(day.sheet!.id)}/approve`, { revision: day.sheet!.revision });
        next[date] = { ...day, sheet, rows: sheet.rows, notes: sheet.notes, error: "" }; approved++;
      } catch (error) { next[date] = { ...day, error: operationError(error) }; }
      commit({ ...next });
    }
    setBusy(false); refresh(); setMessage(`${approved} of ${approvals.length} days approved for payroll.`);
    if (approved !== approvals.length) setProblem("Some days could not be approved. Open the flagged date for details. Successfully approved days are locked.");
  };
  const reloadDay = async (date: string) => {
    if (busy || (days[date].dirty && !window.confirm(`Discard unsaved edits for ${shortDate(date)} and reload this day?`))) return;
    setBusy(true);
    try {
      const draft = await apiGet<AttendanceDraft>(`${OPS}/attendance?company_id=${encodeURIComponent(company)}&attendance_date=${date}`);
      commit({ ...days, [date]: workspaceDay(draft) }); setProblem("");
    } catch (error) { setProblem(operationError(error)); }
    finally { setBusy(false); }
  };
  const reopen = async (date: string) => {
    const day = days[date];
    if (busy || !day.sheet || !window.confirm("Reopen this approved day? Saved payroll stays unchanged; re-import attendance in any affected payroll after corrections.")) return;
    setBusy(true);
    try {
      const sheet = await apiPost<AttendanceSheet>(`${OPS}/attendance/${encodeURIComponent(day.sheet.id)}/reopen`, { revision: day.sheet.revision });
      let nextDay: WorkspaceDay = { ...day, sheet, error: "" };
      try {
        const latest = await apiGet<AttendanceDraft>(`${OPS}/attendance?company_id=${encodeURIComponent(company)}&attendance_date=${date}`);
        nextDay = workspaceDay(latest);
      } catch { nextDay.reloadRequired = true; nextDay.error = "Day reopened, but its workforce could not refresh. Reload this day before editing."; }
      commit({ ...days, [date]: nextDay });
      if (active && !nextDay.rows.some(row => row.assignment_id === active.id)) setActive({ date, id: nextDay.rows[0]?.assignment_id ?? "" });
      refresh(); setMessage("Day reopened. After correcting and approving it, re-import attendance in any affected payroll.");
    } catch (error) { setProblem(operationError(error)); }
    finally { setBusy(false); }
  };
  const activeDay = active ? days[active.date] : null;
  const activeRow = activeDay?.rows.find(row => row.assignment_id === active?.id);
  const locked = activeDay?.reloadRequired || activeDay?.sheet?.status === "Approved" || !!active && active.date > today;
  return <div className="space-y-4" aria-busy={busy}>
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0F2444] p-5 text-white">
        <div><p className="text-xs font-semibold uppercase tracking-widest text-orange-300">Monthly attendance</p><h2 className="mt-1 text-xl font-semibold">{initial[dates[0]].company_name}</h2><p className="mt-1 text-sm text-slate-300">{people.length} employees · {approvedCount} approved days · {changed.length} unsaved days</p></div>
        <Button variant="outline" className="border-slate-500 bg-transparent text-white hover:bg-white/10 hover:text-white" disabled={busy} onClick={() => { if (!changed.length || window.confirm("Discard all unsaved attendance edits and reload the month?")) reload(); }}>Reload month</Button>
      </div>
      <fieldset disabled={busy} className="space-y-4 p-5">
        <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto]">
          <Field label="From"><DateInput aria-label="Select attendance from" min={dates[0]} max={dates.at(-1)} value={from} onValueChange={value => value ? setFrom(value) : false} /></Field>
          <Field label="To"><DateInput aria-label="Select attendance to" min={dates[0]} max={dates.at(-1)} value={to} onValueChange={value => value ? setTo(value) : false} /></Field>
          <Button variant="outline" className="mt-7" disabled={!from || !to || from > to} onClick={() => { setSelected(dates.filter(date => date >= from && date <= to && date <= today && days[date].rows.length)); setMessage(""); }}>Select dates</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3"><span className="text-sm font-semibold">{selected.length} dates selected</span><Button variant="link" className="h-auto px-1" onClick={() => setSelected([])}>Clear selection</Button><Button variant="outline" disabled={!selected.some(date => days[date].sheet?.status !== "Approved" && days[date].rows.some(row => row.status === "Unmarked"))} onClick={() => apply("prepare")}><CheckCheck className="size-4" />Prepare remaining staff as present</Button><p className="text-xs text-slate-600">Selected dates only. Existing leave, holidays and overtime are kept.</p></div>
        <div className="grid items-end gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Field label="Employee on leave"><select aria-label="Batch employee on leave" className={selectClass} value={employee} onChange={event => setEmployee(event.target.value)}><option value="">Choose employee</option>{people.map(person => <option value={person.assignment_id} key={person.assignment_id}>{person.full_name} · {person.assignment_id.slice(-6)}</option>)}</select></Field>
          <Field label="Leave type"><select aria-label="Batch leave type" className={selectClass} value={leaveType} onChange={event => setLeaveType(event.target.value as Status)}>{["Unpaid leave", "Paid leave", "Half-day", "Absent", "Holiday", "Weekly off"].map(status => <option key={status}>{status}</option>)}</select></Field>
          <Button disabled={!employee || !selected.length || !selected.some(date => days[date].sheet?.status !== "Approved" && days[date].rows.some(row => row.assignment_id === employee))} onClick={() => apply("leave")}>Apply to selected dates</Button>
        </div>
      </fieldset>
    </div>
    <Problem text={problem} />
    {message && <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h3 className="font-semibold">Employee attendance sheet</h3><p id="attendance-sheet-help" className="mt-1 text-xs text-slate-500">Tick date headings to select dates. Click an entry to edit status, overtime or notes. Scroll sideways for more dates.</p></div><Input aria-label="Search attendance employees" className="max-w-xs" placeholder="Search employee, role or ID" value={search} onChange={event => setSearch(event.target.value)} /></div>
      <div className="max-h-[560px] overflow-auto rounded-b-xl focus-visible:outline-2 focus-visible:outline-orange-500" tabIndex={0} aria-label="Scrollable monthly attendance sheet" aria-describedby="attendance-sheet-help">
        <table className="w-full border-separate border-spacing-0 text-sm"><caption className="sr-only">Monthly attendance. A dash means the employee is not deployed on that date. A dot means attendance is unmarked.</caption><thead className="sticky top-0 z-20"><tr><th scope="col" className="sticky left-0 z-30 min-w-48 border-b border-r bg-slate-100 p-3 text-left">Employee</th>{dates.map(date => <th key={date} scope="col" className={`min-w-20 border-b bg-slate-100 px-2 py-3 text-center ${selected.includes(date) ? "bg-orange-50" : ""}`}><label className="flex cursor-pointer flex-col items-center gap-1"><span className="text-[10px] font-normal text-slate-500">{weekday(date)}</span><span>{shortDate(date)}</span><input type="checkbox" className="size-4 accent-orange-600" aria-label={`Select ${date}`} checked={selected.includes(date)} disabled={busy || date > today || !days[date].rows.length} onChange={event => setSelected(event.target.checked ? [...selected, date] : selected.filter(item => item !== date))} /></label><button type="button" disabled={busy} aria-label={`Review day ${date}`} onClick={() => setActive({ date, id: days[date].rows[0]?.assignment_id ?? "" })} className={`mt-2 flex w-full items-center justify-center gap-1 rounded px-1 py-1 text-[10px] ${days[date].error ? "bg-red-100 text-red-800" : days[date].sheet?.status === "Approved" ? "bg-emerald-50 text-emerald-900" : "text-slate-600"}`}>{days[date].error ? "Error" : days[date].dirty ? "Unsaved" : days[date].sheet?.status === "Approved" ? <><LockKeyhole className="size-3" />Approved</> : days[date].sheet ? "Draft" : date > today ? "Future" : "Not saved"}<ChevronDown className="size-3" /></button></th>)}</tr></thead><tbody>{visible.map(person => <tr key={person.assignment_id}><th scope="row" className="sticky left-0 z-10 border-b border-r bg-white p-3 text-left font-medium"><span className="block max-w-56 truncate">{person.full_name}</span><span className="block text-xs font-normal text-slate-500">{person.role || "Role not set"} · {person.assignment_id.slice(-6)}</span></th>{dates.map(date => { const day = days[date]; const row = dayRows[date].get(person.assignment_id); return <td key={date} className={`border-b p-1.5 text-center ${selected.includes(date) ? "bg-orange-50/40" : ""}`}>{row ? <button type="button" disabled={busy} aria-label={`${person.full_name}, ${date}: ${row.status}${day.sheet?.status === "Approved" ? ", approved" : ""}`} title={`${row.status} · ${row.shift} · ${row.overtime_hours}h OT`} className={`min-h-11 w-full rounded-md border px-2 py-1 text-xs font-semibold transition-colors hover:ring-2 hover:ring-orange-400 focus-visible:ring-2 focus-visible:ring-orange-600 ${cellStyle(row.status)} ${active?.date === date && active.id === person.assignment_id ? "ring-2 ring-orange-500" : ""}`} onClick={() => setActive({ date, id: person.assignment_id })}>{statusCode[row.status]}{Number(row.overtime_hours) > 0 && <span className="block text-[9px] font-normal">+{row.overtime_hours}h</span>}</button> : <span className="text-slate-300" aria-label="Not deployed">—</span>}</td>; })}</tr>)}</tbody></table>
        {!visible.length && <p className="p-6 text-sm text-slate-500">{people.length ? "No employees match your search." : "No employees are deployed in this month. Check joining and leaving dates in Company Workforce."}</p>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 p-4 text-xs text-slate-600">{attendanceStatuses.map(status => <span key={status}><strong>{statusCode[status]}</strong> {status}</span>)}<span>— Not deployed</span></div>
    </div>
    {active && activeDay && <div className={`${box} space-y-4 border-orange-200`} aria-label="Attendance day details" ref={detail} tabIndex={-1}>
      <div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">{shortDate(active.date)} · {activeRow?.full_name ?? "Day details"}</h3><p className="mt-1 text-xs text-slate-500">{activeDay.sheet?.status ?? "Not saved"}{activeDay.dirty ? " · Unsaved changes" : ""}{locked ? " · Read only" : ""}</p></div><div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => void reloadDay(active.date)}>Reload this day</Button><Button variant="ghost" onClick={() => setActive(null)}>Close details</Button></div></div>
      <Problem text={activeDay.error} />
      {!!activeDay.review_warnings?.length && <div role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">Review before approving this day</p>{activeDay.review_warnings.map(warning => <p key={warning}>{warning}</p>)}<p>Save an explanation of at least 10 characters in day notes before approval.</p></div>}
      <fieldset disabled={busy || !!locked} className="grid gap-4 md:grid-cols-3">
        {activeRow && <><Field label="Attendance"><select aria-label="Edit attendance status" className={selectClass} value={activeRow.status} onChange={event => { const status = event.target.value as Status; editRow(active.date, active.id, { status, ...(!working(status) ? { overtime_hours: "0" } : {}) }); }}>{attendanceStatuses.map(status => <option key={status}>{status}</option>)}</select></Field><Field label="Shift"><select aria-label="Edit attendance shift" className={selectClass} value={activeRow.shift} onChange={event => editRow(active.date, active.id, { shift: event.target.value as AttendanceRow["shift"] })}>{["General", "Morning", "Afternoon", "Night"].map(shift => <option key={shift}>{shift}</option>)}</select></Field><Field label="Overtime hours"><Input aria-label="Edit overtime hours" type="number" min="0" max="24" step="0.01" disabled={!working(activeRow.status)} value={activeRow.overtime_hours} onChange={event => editRow(active.date, active.id, { overtime_hours: event.target.value })} /></Field></>}
        <div className="md:col-span-3"><Field label="Day notes"><Textarea aria-label="Attendance day notes" maxLength={1000} value={activeDay.notes} onChange={event => editDay(active.date, day => ({ ...day, notes: event.target.value }))} /></Field></div>
      </fieldset>
      {activeDay.sheet?.status === "Approved" && <Button variant="outline" disabled={busy} onClick={() => void reopen(active.date)}>Reopen for correction</Button>}
    </div>}
    <div className="sticky bottom-0 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
      <div><p className="text-sm font-semibold">{changed.length} days to save · {approvals.length} selected days ready for approval</p><p className="mt-1 max-w-xl text-xs text-slate-500">{busy ? "Working through dates. Keep this page open." : blocked ? "Save and fully mark all selected days before approval. Review flagged days and add required notes." : "Saving keeps attendance in draft. Payroll uses approved attendance only."}</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || !changed.length} onClick={() => void save()}><Save className="size-4" />Save changed days</Button><Button disabled={busy || !approvals.length || blocked} onClick={() => void approve()}><LockKeyhole className="size-4" />Approve selected days</Button></div>
    </div>
  </div>;
}

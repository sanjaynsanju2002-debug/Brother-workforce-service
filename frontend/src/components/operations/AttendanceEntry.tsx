import { useEffect, useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type EntryMode = "all" | "leave";
type Status = "Unmarked" | "Present" | "Absent" | "Half-day" | "Paid leave" | "Unpaid leave" | "Leave" | "Holiday" | "Weekly off";
export type EntryRow = { assignment_id: string; full_name: string; employee_id?: string | null; status: Status; overtime_hours: string };
const exceptions: Status[] = ["Unpaid leave", "Paid leave", "Half-day", "Absent", "Holiday", "Weekly off"];

/** Complete only unmarked rows; existing attendance and overtime remain authoritative. */
export function prepareLeaveEntry<T extends EntryRow>(rows: T[]): T[] {
  return rows.map(row => row.status === "Unmarked" ? { ...row, status: "Present" } : row);
}

export default function AttendanceEntry<T extends EntryRow>({ rows, onChange, mode, onMode, disabled, children }: {
  rows: T[]; onChange: (rows: T[]) => void; mode: EntryMode; onMode: (mode: EntryMode) => void; disabled: boolean; children: ReactNode;
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [employee, setEmployee] = useState("");
  const [leaveType, setLeaveType] = useState<Status>("Unpaid leave");
  useEffect(() => {
    if (mode === "leave" && !disabled && rows.some(row => row.status === "Unmarked")) onChange(prepareLeaveEntry(rows));
  }, [mode, disabled, rows, onChange]);
  const onLeave = rows.filter(row => !["Present", "Unmarked"].includes(row.status));
  const available = rows.filter(row => ["Present", "Unmarked"].includes(row.status));
  const choices = available.filter(row => `${row.full_name} ${row.employee_id || ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const changeStatus = (assignment: string, status: Status) => onChange(rows.map(row => row.assignment_id === assignment ? {
    ...row, status, ...(!["Present", "Half-day"].includes(status) ? { overtime_hours: "0" } : {}),
  } : row));
  return <div className="space-y-4" data-testid="attendance-entry">
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Attendance entry mode">
      <span className="mr-1 text-sm font-medium">Entry mode</span>
      <Button type="button" variant={mode === "all" ? "default" : "outline"} aria-pressed={mode === "all"} disabled={disabled} onClick={() => onMode("all")}>All statuses</Button>
      <Button type="button" variant={mode === "leave" ? "default" : "outline"} aria-pressed={mode === "leave"} disabled={disabled} onClick={() => onMode("leave")}>Leave-only entry</Button>
    </div>
    {mode === "all" ? children : <>
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
        <p className="font-semibold">Enter only the employees on leave</p>
        <p className="mt-1">Remaining unmarked employees are shown as present for this date. Existing leave, absence, holiday and weekly-off entries are kept. Review the roster, save the draft, then approve the day for payroll.</p>
        <p className="mt-2 font-semibold" role="status">{rows.filter(row => row.status === "Present").length} present · {onLeave.length} leave / other exceptions · {rows.length} employees</p>
      </div>
      <fieldset disabled={disabled} className="grid min-w-0 gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_11rem_auto]">
        <div className="min-w-0"><Label htmlFor={`${id}-search`}>Find employee</Label><Input id={`${id}-search`} aria-label="Find employee on leave" onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or employee ID" /></div>
        <div className="min-w-0"><Label htmlFor={`${id}-employee`}>Employee on leave</Label><select id={`${id}-employee`} aria-label="Employee on leave" className="min-h-11 w-full min-w-0 rounded-lg border bg-white px-3 text-sm" value={choices.some(row => row.assignment_id === employee) ? employee : ""} onChange={e => setEmployee(e.target.value)}><option value="">Select employee</option>{choices.map(row => <option key={row.assignment_id} value={row.assignment_id}>{row.full_name}{row.employee_id ? ` · ${row.employee_id}` : ""}</option>)}</select></div>
        <div><Label htmlFor={`${id}-type`}>Leave type</Label><select id={`${id}-type`} aria-label="New leave type" className="min-h-11 w-full rounded-lg border bg-white px-3 text-sm" value={leaveType} onChange={e => setLeaveType(e.target.value as Status)}><option>Unpaid leave</option><option>Paid leave</option></select></div>
        <Button type="button" className="self-end" disabled={disabled || !choices.some(row => row.assignment_id === employee)} onClick={() => { changeStatus(employee, leaveType); setEmployee(""); setSearch(""); }}>Add leave</Button>
      </fieldset>
      <div className="space-y-3"><h3 className="font-semibold">Leave and other exceptions</h3>{!onLeave.length && <p className="text-sm text-slate-500">No leave entered. All listed employees are shown as present.</p>}{onLeave.map(row => <div key={row.assignment_id} className="grid gap-3 rounded-xl border bg-white p-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-center"><div className="min-w-0"><p className="break-words font-medium">{row.full_name}</p>{row.employee_id && <p className="text-xs text-slate-500">{row.employee_id}</p>}</div><select disabled={disabled} aria-label={`Leave type for ${row.full_name}`} className="min-h-11 w-full rounded-lg border bg-white px-3 text-sm" value={row.status === "Leave" ? "Unpaid leave" : row.status} onChange={e => changeStatus(row.assignment_id, e.target.value as Status)}>{exceptions.map(status => <option key={status}>{status}</option>)}</select><Button type="button" disabled={disabled} variant="outline" aria-label={`Mark ${row.full_name} present`} onClick={() => changeStatus(row.assignment_id, "Present")}>Mark present</Button></div>)}</div>
      <p className="text-xs text-slate-500">Paid leave counts as one payable day. Unpaid leave counts as zero. Use the full roster below for shifts, overtime or other attendance changes.</p>
      <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">Review full roster, shifts and overtime</summary><div className="mt-4">{children}</div></details>
    </>}
  </div>;
}

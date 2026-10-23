import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { indiaToday } from "@/lib/finance";
import { OPS, getCompanies, operationError } from "@/lib/operations";
import { Field, Heading, Problem, QueryStatus } from "./Common";
import { box, selectClass, useOperationsRefresh } from "@/lib/operations";

type Row = { assignment_id: string; full_name: string; role: string; status: "Unmarked" | "Present" | "Absent" | "Half-day" | "Leave"; overtime_hours: string };
type Sheet = { id: string; revision: number; status: "Draft" | "Approved"; rows: Row[]; notes: string; approved_by?: string; approved_at?: string };
type Draft = { employees: { id: string; full_name: string; role: string }[]; sheet: Sheet | null; company_name: string };
const statuses: Row["status"][] = ["Unmarked", "Present", "Absent", "Half-day", "Leave"];
export default function Attendance() {
  const [company, setCompany] = useState(""); const [day, setDay] = useState(indiaToday());
  const dirty = useRef(false);
  const companies = useQuery({ queryKey: ["ops", "companies"], queryFn: getCompanies });
  const query = useQuery({ queryKey: ["ops", "attendance", company, day], queryFn: () => apiGet<Draft>(`${OPS}/attendance?company_id=${company}&attendance_date=${day}`), enabled: !!company && !!day, refetchOnWindowFocus: false });
  const switchValue = (set: (v: string) => void, value: string) => { if (dirty.current && !window.confirm("Discard the unsaved attendance changes?")) return false; dirty.current = false; set(value); };
  return <section className="space-y-5" data-testid="attendance-panel"><Heading title="Daily Attendance" text="Mark each employee, save a draft, then approve it. Payroll imports only approved days and overtime. Leave is unpaid; half-day counts as 0.5 worked day." />
    <div className={`${box} grid gap-4 sm:grid-cols-2`}><Field label="Company"><select aria-label="Attendance company" className={selectClass} value={company} onChange={(e) => switchValue(setCompany, e.target.value)}><option value="">Select company</option>{companies.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Attendance date"><DateInput aria-label="Attendance date" value={day} required onValueChange={(v) => v ? switchValue(setDay, v) : false} /></Field></div>
    <QueryStatus pending={companies.isPending || (!!company && query.isPending)} error={companies.error || query.error} retry={() => { void companies.refetch(); if (company) void query.refetch(); }} />
    {!company && <p className="text-sm text-slate-500">Select a company to load its workforce.</p>}
    {query.data && <AttendanceEditor key={`${company}:${day}:${query.data.sheet?.revision ?? 0}:${query.dataUpdatedAt}`} company={company} day={day} draft={query.data} onDirty={(v) => { dirty.current = v; }} reload={() => query.refetch()} />}
  </section>;
}
function AttendanceEditor({ company, day, draft, onDirty, reload }: { company: string; day: string; draft: Draft; onDirty: (v: boolean) => void; reload: () => unknown }) {
  const old = draft.sheet;
  const savedRows = new Map(old?.rows.map((r) => [r.assignment_id, r]));
  const initial = old?.status === "Approved" ? old.rows : draft.employees.map((p): Row => ({ assignment_id: p.id, full_name: p.full_name, role: p.role, status: savedRows.get(p.id)?.status ?? "Unmarked", overtime_hours: savedRows.get(p.id)?.overtime_hours ?? "0" }));
  const [rows, setRows] = useState(initial); const [notes, setNotes] = useState(old?.notes ?? ""); const [dirty, setDirty] = useState(false); const [problem, setProblem] = useState("");
  const refresh = useOperationsRefresh();
  const locked = old?.status === "Approved";
  const edit = (id: string, changes: Partial<Row>) => { setRows((items) => items.map((r) => r.assignment_id === id ? { ...r, ...changes } : r)); setDirty(true); onDirty(true); setProblem(""); };
  const save = useMutation({ mutationFn: () => apiPut<Sheet>(`${OPS}/attendance`, { company_id: company, attendance_date: day, revision: old?.revision ?? null, notes, rows: rows.map(({ assignment_id, status, overtime_hours }) => ({ assignment_id, status, overtime_hours: overtime_hours || "0" })) }), onSuccess: () => { onDirty(false); refresh(); toast.success("Attendance draft saved"); }, onError: (e) => setProblem(operationError(e)) });
  const action = useMutation({ mutationFn: (name: "approve" | "reopen") => apiPost(`${OPS}/attendance/${old!.id}/${name}`, { revision: old!.revision }), onSuccess: () => { onDirty(false); refresh(); toast.success(locked ? "Attendance reopened. Re-import any affected payroll after making changes." : "Attendance approved"); }, onError: (e) => setProblem(operationError(e)) });
  const busy = save.isPending || action.isPending;
  const marked = rows.filter((r) => r.status !== "Unmarked").length;
  return <div className={`${box} space-y-4`}><div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-semibold">{draft.company_name} · {day}</h2><p className="mt-1 text-xs text-slate-500">{marked} / {rows.length} marked · {old?.status ?? "Unsaved draft"}{dirty && " · Unsaved changes"}{locked && ` · Approved by ${old.approved_by}`}</p></div><Button variant="outline" onClick={() => { if (!dirty || window.confirm("Discard unsaved attendance and reload?")) { onDirty(false); reload(); } }}>Reload workforce</Button></div>
    <Problem text={problem} />{!rows.length ? <p className="text-sm text-slate-600">No employees are deployed for this date. Check joining and leaving dates in Company Workforce.</p> : <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4"><fieldset disabled={locked || busy} className="space-y-4 min-w-0"><div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="p-3">Employee</th><th className="p-3">Attendance</th><th className="p-3">Overtime hours</th></tr></thead><tbody>{rows.map((r) => <tr key={r.assignment_id} className="border-b"><th scope="row" className="p-3 font-medium">{r.full_name}<span className="mt-1 block text-xs font-normal text-slate-500">{r.role || "Role not set"}</span></th><td className="p-3"><select aria-label={`Attendance for ${r.full_name}`} className={selectClass} value={r.status} onChange={(e) => { const status = e.target.value as Row["status"]; edit(r.assignment_id, { status, ...(status === "Present" || status === "Half-day" ? {} : { overtime_hours: "0" }) }); }}>{statuses.map((s) => <option key={s}>{s}</option>)}</select></td><td className="p-3"><Input aria-label={`Overtime hours for ${r.full_name}`} type="number" min="0" max="24" step="0.01" value={r.overtime_hours} disabled={r.status !== "Present" && r.status !== "Half-day"} onChange={(e) => edit(r.assignment_id, { overtime_hours: e.target.value })} /></td></tr>)}</tbody></table></div><Field label="Attendance notes"><Textarea aria-label="Attendance notes" maxLength={1000} value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); onDirty(true); }} /></Field><Button type="submit" disabled={!dirty && !!old}>Save draft</Button></fieldset>
      {old && <div className="flex flex-wrap items-center gap-3 border-t pt-4"><Button type="button" variant={locked ? "outline" : "default"} disabled={busy || dirty || (!locked && (marked !== rows.length || day > indiaToday()))} onClick={() => { if (window.confirm(locked ? "Reopen this approved sheet? Saved payroll stays unchanged; import again after corrections." : "Approve this saved attendance for payroll?")) action.mutate(locked ? "reopen" : "approve"); }}>{locked ? "Reopen for correction" : "Approve attendance"}</Button><p className="text-xs text-slate-500">{dirty ? "Save the draft before approving." : "Approval keeps this day locked until you reopen it."}</p></div>}
    </form>}
  </div>;
}

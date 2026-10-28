import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPut } from "@/lib/api";
import { formatIndianDate } from "@/lib/calendarDate";
import { indiaToday } from "@/lib/finance";
import { OPS, getCompanies, operationError } from "@/lib/operations";
import { Field, Heading, Problem, QueryStatus } from "./Common";
import { box, selectClass, useOperationsRefresh } from "@/lib/operations";

type Form = { company_id: string; role: string; required_count: string; needed_date: string; follow_up_date: string; status: "Open" | "Closed"; notes: string; revision: number | null };
type Record = Omit<Form, "required_count"> & { id: string; company_name: string; required_count: number; deployed: number; present: number | null; shortage: number; company_archived: boolean };
const blank = (): Form => ({ company_id: "", role: "", required_count: "", needed_date: indiaToday(), follow_up_date: "", status: "Open", notes: "", revision: null });
export default function Staffing() {
  const [form, setForm] = useState(blank); const [problem, setProblem] = useState(""); const [filter, setFilter] = useState("");
  const formRef = useRef<HTMLFormElement>(null); const refresh = useOperationsRefresh();
  const companies = useQuery({ queryKey: ["ops", "companies"], queryFn: getCompanies });
  const query = useQuery({ queryKey: ["ops", "requirements"], queryFn: () => apiGet<Record[]>(`${OPS}/requirements`) });
  const save = useMutation({ mutationFn: () => apiPut(`${OPS}/requirements`, { ...form, required_count: Number(form.required_count), follow_up_date: form.follow_up_date || null }), onSuccess: () => { setForm(blank()); setProblem(""); refresh(); toast.success("Staffing requirement saved"); }, onError: (e) => setProblem(operationError(e)) });
  const items = (query.data ?? []).filter((r) => !filter || r.company_id === filter);
  return <section className="space-y-5" data-testid="staffing-panel"><Heading title="Staffing Requirements" text="Set the total workers a company needs for each role. Compare the target with active deployments and today's approved attendance. A future needed date remains visible for planning."><Button type="button" variant="outline" size="sm" onClick={() => query.refetch()}>Refresh records</Button></Heading>
    <form ref={formRef} className={`${box} space-y-4`} onSubmit={(e) => { e.preventDefault(); save.mutate(); }}><h2 className="font-semibold">{form.revision ? "Edit requirement" : "Add a requirement"}</h2><Problem text={problem} /><fieldset disabled={save.isPending} className="grid min-w-0 gap-4 sm:grid-cols-2">
      <Field label="Company *"><select required aria-label="Requirement company" className={selectClass} disabled={!!form.revision} value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })}><option value="">Select company</option>{companies.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Role *"><Input required aria-label="Required role" maxLength={150} disabled={!!form.revision} placeholder="Use the role name from Company Workforce" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></Field>
      <Field label="Total workers required *"><Input required aria-label="Total workers required" type="number" min="0" max="100000" step="1" value={form.required_count} onChange={(e) => setForm({ ...form, required_count: e.target.value })} /></Field>
      <Field label="Needed by *"><DateInput required aria-label="Workers needed by" value={form.needed_date} onValueChange={(v) => setForm({ ...form, needed_date: v })} /></Field>
      <Field label="Follow-up date"><DateInput aria-label="Staffing follow-up date" value={form.follow_up_date} onValueChange={(v) => setForm({ ...form, follow_up_date: v })} /></Field>
      <Field label="Status"><select aria-label="Requirement status" className={selectClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Form["status"] })}><option>Open</option><option>Closed</option></select></Field>
      <div className="sm:col-span-2"><Field label="Notes / replacement needs"><Textarea aria-label="Staffing notes" maxLength={1000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field></div>
      <div className="flex gap-2 sm:col-span-2"><Button type="submit">Save requirement</Button>{form.revision && <Button type="button" variant="outline" onClick={() => { setForm(blank()); setProblem(""); }}>Cancel edit</Button>}</div></fieldset><p className="text-xs text-slate-500">One target per company and role. Edit its target when the requirement changes, or close it when fulfilled. Role names must match Company Workforce.</p></form>
    <QueryStatus pending={companies.isPending || query.isPending} error={companies.error || query.error} retry={() => { void companies.refetch(); void query.refetch(); }} />
    <Field label="Filter company"><select aria-label="Filter staffing company" className={selectClass} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">All companies</option>{[...new Map((query.data ?? []).map((r) => [r.company_id, r.company_name])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field>
    {query.isSuccess && !items.length && <p className={`${box} text-sm text-slate-500`}>No staffing requirements recorded.</p>}
    {items.map((r) => <article key={r.id} className={`${box} space-y-4`}><div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-semibold">{r.company_name} · {r.role}</h2><p className="mt-1 text-xs text-slate-500">{r.status}{r.company_archived && " · Company archived"} · Needed {formatIndianDate(r.needed_date)}{r.follow_up_date && ` · Follow up ${formatIndianDate(r.follow_up_date)}`}</p></div><Button variant="outline" size="sm" disabled={r.company_archived} onClick={() => { setForm({ company_id: r.company_id, role: r.role, required_count: String(r.required_count), needed_date: r.needed_date, follow_up_date: r.follow_up_date || "", notes: r.notes, status: r.status, revision: r.revision }); setProblem(""); formRef.current?.scrollIntoView({ behavior: "smooth" }); }}>Edit / close</Button></div>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{[["Required", r.required_count], ["Deployed", r.deployed], ["Present today", r.present ?? "Not approved"], ["Deployment shortage", r.shortage]].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div>)}</div>
      {r.status === "Open" && r.needed_date <= indiaToday() && r.present !== null && r.present < r.required_count && <p className="text-sm text-amber-800">{r.required_count - r.present} fewer workers present than requested today. Review absences and arrange replacements.</p>}{r.notes && <p className="whitespace-pre-wrap text-sm text-slate-600">{r.notes}</p>}
    </article>)}
  </section>;
}

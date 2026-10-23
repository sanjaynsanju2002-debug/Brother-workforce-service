import CompanyDirectory from "./CompanyDirectory";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { Client, Worker } from "@/types";
import { rupees } from "@/lib/finance";
import { refreshCompanyQueries } from "@/lib/companyQueries";

type Assignment = {
  id: string;
  client_id: string;
  company_name: string;
  worker_id: string | null;
  employee_id: string | null;
  full_name: string;
  mobile: string | null;
  role: string | null;
  start_date: string | null;
  end_date?: string | null;
  notes: string | null;
  status: "Active" | "Completed";
  created_at: string;
  salary: string | null;
  salary_basis: "Monthly" | "Daily";
};

type Form = { client_id: string; worker_id: string; employee_id: string; full_name: string; mobile: string; role: string; start_date: string; notes: string; salary: string; salary_basis: "Monthly" | "Daily" };
const EMPTY: Form = { client_id: "", worker_id: "", employee_id: "", full_name: "", mobile: "", role: "", start_date: "", notes: "", salary: "", salary_basis: "Monthly" };

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body as { detail?: unknown } | null;
    if (typeof body?.detail === "string") return body.detail;
  }
  return "Could not save the assignment";
}

export default function WorkforceManager({ pin }: { pin: string }) {
  const qc = useQueryClient();
  const q = "";
  const key = ["admin-assignments", pin];
  const [form, setForm] = useState<Form>(EMPTY);
  const [companyFilter, setCompanyFilter] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyGstin, setCompanyGstin] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [salary, setSalary] = useState("");
  const [endDate, setEndDate] = useState("");
  const [salaryBasis, setSalaryBasis] = useState<"Monthly" | "Daily">("Monthly");
  const clients = useQuery({ queryKey: ["admin-clients", pin], queryFn: () => apiGet<Client[]>(`/admin/clients${q}`) });
  const workers = useQuery({ queryKey: ["admin-talents", pin], queryFn: () => apiGet<Worker[]>(`/admin/talents${q}`) });
  const assignments = useQuery({ queryKey: key, queryFn: () => apiGet<Assignment[]>(`/admin/assignments${q}`) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ["ops"] });
    void qc.invalidateQueries({ queryKey: ["admin-talents", pin] });
    void qc.invalidateQueries({ queryKey: ["payroll-draft"] });
    void qc.invalidateQueries({ queryKey: ["payroll-companies"] });
  };
  const createCompany = useMutation({
    mutationFn: (name: string) => apiPost<Client>(`/admin/clients${q}`, { name: name.trim(), billing_address: companyAddress.trim(), gstin: companyGstin.trim(), visible: false }),
    onSuccess: (client) => {
      refreshCompanyQueries(qc);
      setForm((current) => ({ ...current, client_id: client.id }));
      setNewCompany("");
      setCompanyAddress("");
      setCompanyGstin("");
      toast.success("Private company added");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const removeCompany = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/admin/clients/${id}${q}`),
    onSuccess: (_, id) => {
      refreshCompanyQueries(qc);
      setForm((current) => current.client_id === id ? { ...current, client_id: "" } : current);
      setCompanyFilter((current) => current === id ? "" : current);
      setEditingId(null);
      toast.success("Company removed from Workforce, Payroll and Invoice company lists");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const add = useMutation({
    mutationFn: (value: Form) => apiPost<Assignment>(`/admin/assignments${q}`, {
      ...value, worker_id: value.worker_id || null, full_name: value.full_name.trim(), salary: value.salary || null,
    }),
    onSuccess: () => { setForm(EMPTY); refresh(); toast.success("Employee added to Workforce and Talent Bank"); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const changeStatus = useMutation({
    mutationFn: (value: { id: string; status: "Active" | "Completed" }) =>
      apiPatch<Assignment>(`/admin/assignments/${value.id}${q}`, { status: value.status }),
    onSuccess: () => { refresh(); toast.success("Assignment updated"); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/admin/assignments/${id}${q}`),
    onSuccess: () => { refresh(); toast.success("Assignment removed"); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const saveEmployeeId = useMutation({
    mutationFn: (value: { id: string; employee_id: string; salary: string; salary_basis: "Monthly" | "Daily"; end_date: string }) =>
      apiPatch<Assignment>(`/admin/assignments/${value.id}${q}`, { employee_id: value.employee_id, salary: value.salary || null, salary_basis: value.salary_basis, end_date: value.end_date || null }),
    onSuccess: () => { setEditingId(null); refresh(); toast.success("Employee details saved"); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const all = assignments.data ?? [];
  const shown = companyFilter ? all.filter((a) => a.client_id === companyFilter) : all;
  const active = all.filter((a) => a.status === "Active").length;
  const companyCount = new Set(all.filter((a) => a.status === "Active").map((a) => a.client_id)).size;

  return (
    <div className="space-y-6" data-testid="workforce-manager">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-slate-200 bg-white"><CardContent className="flex items-center gap-4 p-5">
          <Building2 className="h-9 w-9 text-[#C2410C]" />
          <div><p className="text-2xl font-bold text-[#0F2444]">{companyCount}</p><p className="text-sm text-slate-500">Companies with active workers</p></div>
        </CardContent></Card>
        <Card className="border-slate-200 bg-white"><CardContent className="flex items-center gap-4 p-5">
          <Users className="h-9 w-9 text-[#C2410C]" />
          <div><p className="text-2xl font-bold text-[#0F2444]">{active}</p><p className="text-sm text-slate-500">Active assignments</p></div>
        </CardContent></Card>
      </div>

      <Card className="border-slate-200 bg-white"><CardContent className="p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-[#0F2444]">Add a person working at a company</h3>
        <p className="mt-1 text-sm text-slate-500">Select an existing applicant or talent, or enter someone manually. New employees are also saved in Talent Bank. This roster is visible only in the admin dashboard.</p>
        <div className="mt-5 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="min-w-[220px] flex-1"><Label className="mb-2 block">New company (private)</Label>
            <Input value={newCompany} maxLength={150} onChange={(e) => setNewCompany(e.target.value)} placeholder="Company name" data-testid="assignment-new-company" />
          </div>
          <div className="min-w-0 flex-1 basis-52"><Label htmlFor="workforce-billing-address" className="mb-2 block">Billing address</Label><Input id="workforce-billing-address" maxLength={2000} value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} placeholder="Optional" /></div>
          <div className="min-w-0 flex-1 basis-40"><Label htmlFor="workforce-gstin" className="mb-2 block">GSTIN</Label><Input id="workforce-gstin" maxLength={30} value={companyGstin} onChange={(e) => setCompanyGstin(e.target.value.toUpperCase())} placeholder="Optional" /></div>
          <Button type="button" variant="outline" disabled={createCompany.isPending || !newCompany.trim()} onClick={() => createCompany.mutate(newCompany)}>
            Add private company
          </Button>
          <p className="w-full text-xs text-slate-500">Companies added here also appear in Payroll and Invoice. Private companies will not appear in Businesses We Support on the public website.</p>
        </div>
        <form className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => {
          e.preventDefault();
          if (!form.client_id || !form.full_name.trim()) { toast.error("Choose a company and enter a worker name"); return; }
          add.mutate(form);
        }}>
          <div><Label className="mb-2 block">Company *</Label>
            <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} data-testid="assignment-company">
              <option value="">Select company</option>{(clients.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><Label className="mb-2 block">Existing applicant / talent</Label>
            <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={form.worker_id} onChange={(e) => {
              const worker = (workers.data ?? []).find((w) => w.id === e.target.value);
              setForm({ ...form, worker_id: e.target.value, full_name: worker?.full_name ?? "", mobile: worker?.mobile ?? "" });
            }} data-testid="assignment-worker">
              <option value="">Enter manually</option>{(workers.data ?? []).filter((w) => w.status !== "Archived").map((w) => <option key={w.id} value={w.id}>{w.full_name} · {w.mobile}</option>)}
            </select>
          </div>
          <div><Label className="mb-2 block">Person's name *</Label><Input value={form.full_name} disabled={!!form.worker_id} onChange={(e) => setForm({ ...form, full_name: e.target.value })} data-testid="assignment-name" /></div>
          <div><Label htmlFor="assignment-employee-id" className="mb-2 block">Employee ID</Label><Input id="assignment-employee-id" maxLength={80} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} placeholder="e.g. BWS-001" data-testid="assignment-employee-id" /></div>
          <div><Label className="mb-2 block">Mobile</Label><Input value={form.mobile} disabled={!!form.worker_id} onChange={(e) => setForm({ ...form, mobile: e.target.value })} data-testid="assignment-mobile" /></div>
          <div><Label className="mb-2 block">Role / work</Label><Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Machine operator" data-testid="assignment-role" /></div>
          <div><Label htmlFor="assignment-start-date" className="mb-2 block">Start date</Label><DateInput id="assignment-start-date" value={form.start_date} onValueChange={(value) => setForm({ ...form, start_date: value })} data-testid="assignment-start-date" /></div>
          <div><Label htmlFor="assignment-salary" className="mb-2 block">Salary / rate (₹)</Label><Input id="assignment-salary" type="number" inputMode="decimal" min="0" max="1000000000" step="0.01" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} placeholder="Optional" data-testid="assignment-salary" /></div>
          <div><Label htmlFor="assignment-salary-basis" className="mb-2 block">Salary basis</Label><select id="assignment-salary-basis" className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={form.salary_basis} onChange={(e) => setForm({ ...form, salary_basis: e.target.value as "Monthly" | "Daily" })} data-testid="assignment-salary-basis"><option value="Monthly">Per month</option><option value="Daily">Per day</option></select><p className="mt-1 text-xs text-slate-500">Daily salaries prefill the rate in Payroll.</p></div>
          <div className="sm:col-span-2 lg:col-span-3"><Label className="mb-2 block">Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Shift or site details (optional)" /></div>
          <div className="sm:col-span-2 lg:col-span-3"><Button type="submit" disabled={add.isPending || !clients.data?.length} className="bg-[#C2410C] text-white hover:bg-[#9A3412]">
            {add.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Add to workforce
          </Button></div>
        </form>
        {!clients.isLoading && !clients.data?.length && <p className="mt-3 text-sm text-amber-700">Add a company in the Clients tab first.</p>}
      </CardContent></Card>

      <CompanyDirectory />
      <Card className="border-slate-200 bg-white"><CardContent className="p-5 sm:p-6">
        <details>
          <summary className="cursor-pointer text-lg font-semibold text-[#0F2444]">Manage companies ({clients.data?.length ?? 0})</summary>
          <p className="mt-2 text-sm text-slate-500">Removing a company updates the Workforce, Payroll and Invoice company lists. All records are kept and the company can be restored below.</p>
          <div className="mt-4 space-y-2">{(clients.data ?? []).map((company) => <div key={company.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
            <div><p className="font-medium text-[#0F2444]">{company.name}</p><p className="text-xs text-slate-500">{all.filter((person) => person.client_id === company.id).length} workforce assignments</p></div>
            <Button type="button" size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" disabled={removeCompany.isPending || add.isPending || createCompany.isPending || saveEmployeeId.isPending || changeStatus.isPending || remove.isPending} data-testid={`workforce-delete-company-${company.id}`} onClick={() => {
              if (window.confirm(`Archive ${company.name} and its workforce assignments? It will be removed from the active Payroll and Invoice company lists. All records will be kept. Restore the company using Archived companies.`)) removeCompany.mutate(company.id);
            }}><Trash2 className="mr-2 h-4 w-4" />Remove company</Button>
          </div>)}</div>
        </details>
      </CardContent></Card>

      <Card className="border-slate-200 bg-white"><CardContent className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-[#0F2444]">Company workforce</h3>
          <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} aria-label="Filter by company">
            <option value="">All companies</option>{(clients.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {assignments.isLoading && <p className="mt-5 text-sm text-slate-500">Loading workforce…</p>}
        {assignments.isError && <p className="mt-5 text-sm text-red-700">Could not load workforce. Please refresh the page.</p>}
        {!assignments.isLoading && !assignments.isError && shown.length === 0 && <p className="mt-5 text-sm text-slate-500">No assignments recorded yet.</p>}
        <div className="mt-4 space-y-3">
          {shown.map((a) => <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-4" data-testid={`assignment-${a.id}`}>
            <div className="min-w-[200px] flex-1">
              <p className="font-semibold text-[#0F2444]">{a.full_name} <Badge variant={a.status === "Active" ? "default" : "secondary"} className="ml-2">{a.status}</Badge></p>
              <p className="mt-1 text-sm text-slate-600">{a.company_name}{a.role ? ` · ${a.role}` : ""}</p>
              <p className="mt-1 text-sm text-slate-600" data-testid={`assignment-employee-id-${a.id}`}>Employee ID: <span className="font-medium">{a.employee_id || "Not set"}</span></p>
              <p className="mt-1 text-sm text-slate-600" data-testid={`assignment-salary-${a.id}`}>Salary: <span className="font-medium">{a.salary === null ? "Not set" : `${rupees(a.salary)} ${a.salary_basis === "Daily" ? "per day" : "per month"}`}</span></p>
              <p className="mt-1 text-xs text-slate-500">{a.mobile || "No mobile"}{a.start_date ? ` · Started ${a.start_date}` : ""}{a.end_date ? ` · Leaving ${a.end_date}` : ""}{a.notes ? ` · ${a.notes}` : ""}</p>
              {editingId === a.id && <form className="mt-3 flex max-w-2xl flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); saveEmployeeId.mutate({ id: a.id, employee_id: employeeId, salary, salary_basis: salaryBasis, end_date: endDate }); }}>
                <Label htmlFor={`employee-id-${a.id}`} className="sr-only">Employee ID for {a.full_name}</Label>
                <Input id={`employee-id-${a.id}`} className="min-w-0 flex-1 basis-40" maxLength={80} value={employeeId} disabled={saveEmployeeId.isPending} onChange={(event) => setEmployeeId(event.target.value)} autoFocus data-testid={`assignment-edit-id-input-${a.id}`} />
                <div className="min-w-0 flex-1 basis-32"><Label htmlFor={`employee-salary-${a.id}`} className="mb-1 block text-xs">Salary / rate (₹)</Label><Input id={`employee-salary-${a.id}`} type="number" inputMode="decimal" min="0" max="1000000000" step="0.01" value={salary} disabled={saveEmployeeId.isPending} onChange={(event) => setSalary(event.target.value)} data-testid={`assignment-edit-salary-${a.id}`} /></div>
                <div><Label htmlFor={`employee-end-${a.id}`} className="mb-1 block text-xs">Last working date (completed)</Label><DateInput id={`employee-end-${a.id}`} value={endDate} onValueChange={setEndDate} disabled={saveEmployeeId.isPending || a.status === "Active"} /></div>
                <div><Label htmlFor={`employee-salary-basis-${a.id}`} className="mb-1 block text-xs">Salary basis</Label><select id={`employee-salary-basis-${a.id}`} className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm" value={salaryBasis} disabled={saveEmployeeId.isPending} onChange={(event) => setSalaryBasis(event.target.value as "Monthly" | "Daily")}><option value="Monthly">Per month</option><option value="Daily">Per day</option></select></div>
                <Button type="submit" size="sm" disabled={saveEmployeeId.isPending}>Save details</Button>
                <Button type="button" variant="outline" size="sm" disabled={saveEmployeeId.isPending} onClick={() => setEditingId(null)}>Cancel</Button>
              </form>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" disabled={saveEmployeeId.isPending || remove.isPending || changeStatus.isPending} onClick={() => { setEditingId(a.id); setEmployeeId(a.employee_id || ""); setSalary(a.salary ?? ""); setSalaryBasis(a.salary_basis || "Monthly"); setEndDate(a.end_date || ""); }} data-testid={`assignment-edit-id-${a.id}`}>Edit ID / salary</Button>
              <Button size="sm" variant="outline" disabled={changeStatus.isPending || saveEmployeeId.isPending || remove.isPending} onClick={() => changeStatus.mutate({ id: a.id, status: a.status === "Active" ? "Completed" : "Active" })}>
                Mark {a.status === "Active" ? "completed" : "active"}
              </Button>
              <Button size="icon-sm" variant="outline" aria-label={`Remove ${a.full_name}`} disabled={remove.isPending || saveEmployeeId.isPending || changeStatus.isPending} onClick={() => {
                if (window.confirm(`Remove ${a.full_name}'s assignment at ${a.company_name}?`)) remove.mutate(a.id);
              }}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>)}
        </div>
      </CardContent></Card>
    </div>
  );
}

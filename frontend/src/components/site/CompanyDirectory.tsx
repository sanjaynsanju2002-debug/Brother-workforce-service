import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiGet, apiPatch, apiPost } from "@/lib/api";
import { refreshCompanyQueries } from "@/lib/companyQueries";
import type { Client } from "@/types";

export default function CompanyDirectory() {
  const qc = useQueryClient();
  const active = useQuery({ queryKey: ["admin-clients", "directory"], queryFn: () => apiGet<Client[]>("/admin/clients") });
  const archived = useQuery({ queryKey: ["archived-companies"], queryFn: () => apiGet<Client[]>("/admin/clients?archived=true") });
  const [editing, setEditing] = useState<Client | null>(null);
  const message = (error: unknown) => error instanceof ApiError && typeof (error.body as { detail?: string })?.detail === "string" ? (error.body as { detail: string }).detail : "Could not update the company";
  const save = useMutation({
    mutationFn: (company: Client) => apiPatch<Client>(`/admin/clients/${company.id}`, { name: company.name, billing_address: company.billing_address || "", gstin: company.gstin || "" }),
    onSuccess: () => { setEditing(null); refreshCompanyQueries(qc); toast.success("Shared company billing details saved. Saved invoices keep their original details."); },
    onError: (e) => toast.error(message(e)),
  });
  const restore = useMutation({
    mutationFn: (id: string) => apiPost<Client>(`/admin/clients/${id}/restore`),
    onSuccess: () => { refreshCompanyQueries(qc); toast.success("Company and its workforce restored"); },
    onError: (e) => toast.error(message(e)),
  });
  return <details className="rounded-xl border border-slate-200 bg-white p-5" data-testid="company-directory">
    <summary className="cursor-pointer font-semibold text-[#0F2444]">Company billing details &amp; archived companies</summary>
    <p className="mt-3 text-sm text-slate-600">The same company profile is used in Workforce, Payroll and Invoice. Restore brings back the company and its assignments. Saved invoices and payroll retain their original details.</p>
    {(active.isError || archived.isError) && <p role="alert" className="mt-3 text-sm text-red-700">Could not load companies. <button type="button" className="underline" onClick={() => { void active.refetch(); void archived.refetch(); }}>Retry</button></p>}
    <div className="mt-4 space-y-2">{active.data?.map((c) => <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><span className="break-words font-medium">{c.name}</span><Button variant="outline" size="sm" onClick={() => setEditing({ ...c, billing_address: c.billing_address ?? c.location ?? "" })}>Edit billing profile</Button></div>)}</div>
    {editing && <form className="mt-4 grid gap-3 rounded-lg border border-orange-200 p-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(editing); }}>
      <div><Label htmlFor="shared-company-name">Company name</Label><Input id="shared-company-name" required maxLength={150} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
      <div><Label htmlFor="shared-company-gstin">GSTIN</Label><Input id="shared-company-gstin" maxLength={30} value={editing.gstin || ""} onChange={(e) => setEditing({ ...editing, gstin: e.target.value.toUpperCase() })} /></div>
      <div className="sm:col-span-2"><Label htmlFor="shared-company-address">Billing address</Label><Textarea id="shared-company-address" maxLength={2000} value={editing.billing_address || ""} onChange={(e) => setEditing({ ...editing, billing_address: e.target.value })} /></div>
      <div className="flex gap-2"><Button disabled={save.isPending}>Save profile</Button><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button></div>
    </form>}
    <h3 className="mt-5 font-semibold">Archived companies ({archived.data?.length ?? 0})</h3>
    {!archived.data?.length && !archived.isPending && <p className="mt-2 text-sm text-slate-500">No archived companies.</p>}
    {archived.data?.map((c) => <div key={c.id} className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><span className="break-words">{c.name}</span><Button type="button" variant="outline" disabled={restore.isPending} onClick={() => { if (window.confirm(`Restore ${c.name} and its workforce assignments to the active company lists?`)) restore.mutate(c.id); }}>Restore company</Button></div>)}
  </details>;
}

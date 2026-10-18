import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";

type Staff = { id: string; name: string; username: string; role: "operator" | "viewer"; disabled: boolean };
type Preview = { sha256: string; created_at: string; missing_resumes: number; counts: Record<string, { new: number; existing: number }> };
const emptyStaff = { name: "", username: "", pin: "", role: "operator" as Staff["role"] };
const message = (e: unknown) => e instanceof ApiError && typeof (e.body as { detail?: string })?.detail === "string" ? (e.body as { detail: string }).detail : "Could not complete this request. Please try again.";

async function backupPost<T>(path: string, file: File, sha?: string): Promise<T> {
  const data = new FormData(); data.append("file", file); if (sha) data.append("sha256", sha);
  const response = await fetch(`/api/admin/backups/${path}`, { method: "POST", body: data });
  const body = await response.json(); if (!response.ok) throw new ApiError(response.status, body); return body;
}

export default function AdminControls() {
  const qc = useQueryClient();
  const staff = useQuery({ queryKey: ["admin-team"], queryFn: () => apiGet<Staff[]>("/admin/team") });
  const [form, setForm] = useState(emptyStaff);
  const [responseTarget, setResponseTarget] = useState("");
  const service = useQuery({ queryKey: ["service-info"], queryFn: () => apiGet<{ enquiry_response_target: string }>("/service-info") });
  const saveTarget = useMutation({ mutationFn: () => apiPut("/admin/service-info", { enquiry_response_target: responseTarget }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["service-info"] }); setResponseTarget(""); toast.success("Published enquiry response target updated"); }, onError: (e) => toast.error(message(e)) });
  const [resetUser, setResetUser] = useState<Staff | null>(null);
  const [resetPin, setResetPin] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const create = useMutation({ mutationFn: () => apiPost<Staff>("/admin/team", form), onSuccess: () => { setForm(emptyStaff); void staff.refetch(); toast.success("Staff account created. Share the account and PIN privately."); }, onError: (e) => toast.error(message(e)) });
  const change = useMutation({ mutationFn: ({ id, ...body }: { id: string; disabled?: boolean; role?: Staff["role"]; pin?: string }) => apiPatch<Staff>(`/admin/team/${id}`, body), onSuccess: () => { void staff.refetch(); toast.success("Staff access updated. Their sessions were signed out."); }, onError: (e) => toast.error(message(e)) });
  async function downloadBackup() {
    setBusy(true); setResult("");
    try {
      const response = await fetch("/api/admin/backups/download");
      if (!response.ok) throw new ApiError(response.status, await response.json());
      const url = URL.createObjectURL(await response.blob()); const a = document.createElement("a");
      a.href = url; a.download = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] || "BWS-business-backup.zip"; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      const missing = Number(response.headers.get("X-BWS-Missing-Resumes") || 0);
      setResult(missing ? `Backup downloaded. ${missing} resumes could not be included. Check those attachments before relying on this backup.` : "Backup downloaded. Keep a copy outside this device and preview it below to check its contents.");
    } catch (e) { toast.error(message(e)); } finally { setBusy(false); }
  }
  async function inspect() {
    if (!file) return; setBusy(true); setPreview(null); setResult("");
    try { setPreview(await backupPost<Preview>("inspect", file)); } catch (e) { toast.error(message(e)); } finally { setBusy(false); }
  }
  async function restore() {
    if (!file || !preview || !window.confirm("Add the missing records from this backup? Existing records will be kept. Ask your team to pause edits until this finishes.")) return;
    setBusy(true);
    try { const r = await backupPost<{ added: number; skipped: number }>("restore", file, preview.sha256); setResult(`Restore complete: ${r.added} records added; ${r.skipped} existing or conflicting records kept.`); setPreview(null); setFile(null); if (input.current) input.current.value = ""; void qc.invalidateQueries(); } catch (e) { toast.error(message(e)); } finally { setBusy(false); }
  }
  return <div className="grid gap-6 lg:col-span-2">
    <section className="rounded-xl border bg-white p-5 sm:p-6"><h3 className="text-lg font-semibold text-[#0F2444]">Staff accounts</h3><p className="mt-2 text-sm text-slate-600">Give each team member their own account. Operators can manage business records; viewers can only read them. Only the owner can change security, email settings, staff access or backups.</p>
      <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <div><Label htmlFor="staff-name">Staff name</Label><Input id="staff-name" required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label htmlFor="staff-username">Account name</Label><Input id="staff-username" required autoComplete="off" pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,49}" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
        <div><Label htmlFor="staff-pin">New PIN (8–12 digits)</Label><Input id="staff-pin" required type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{8,12}" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} /></div>
        <div><Label htmlFor="staff-role">Access</Label><select id="staff-role" className="h-11 w-full rounded-lg border px-3 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Staff["role"] })}><option value="operator">Operator</option><option value="viewer">View only</option></select></div>
        <Button className="self-end" disabled={create.isPending}>Add staff account</Button>
      </form>
      {staff.isError && <p role="alert" className="mt-3 text-red-700">Could not load staff accounts.</p>}
      <div className="mt-4 space-y-3">{staff.data?.map((s) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3" key={s.id}><div><p className="font-semibold">{s.name}</p><p className="text-sm text-slate-600">{s.username} · {s.role} · {s.disabled ? "Disabled" : "Active"}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={change.isPending} onClick={() => { setResetUser(s); setResetPin(""); }}>Reset PIN</Button><Button variant="outline" disabled={change.isPending} onClick={() => { if (window.confirm(`${s.disabled ? "Enable" : "Disable"} access for ${s.name}?`)) change.mutate({ id: s.id, disabled: !s.disabled }); }}>{s.disabled ? "Enable" : "Disable"}</Button></div></div>)}</div>
      {resetUser && <form className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border p-4" onSubmit={(e) => { e.preventDefault(); change.mutate({ id: resetUser.id, pin: resetPin }, { onSuccess: () => { setResetUser(null); setResetPin(""); } }); }}><div><Label htmlFor="reset-staff-pin">New PIN for {resetUser.name} (8–12 digits)</Label><Input id="reset-staff-pin" type="password" autoComplete="new-password" inputMode="numeric" required pattern="[0-9]{8,12}" value={resetPin} onChange={(e) => setResetPin(e.target.value)} /></div><Button disabled={change.isPending}>Save new PIN</Button><Button type="button" variant="outline" onClick={() => { setResetUser(null); setResetPin(""); }}>Cancel</Button></form>}
    </section>
    <section className="rounded-xl border bg-white p-5 sm:p-6"><h3 className="text-lg font-semibold text-[#0F2444]">Enquiry response target</h3><p className="mt-2 text-sm text-slate-600">Publish a response timeframe only when your team has agreed it and can meet it. It appears on the employer's enquiry receipt.</p><p className="mt-2 text-sm">Current target: {service.data?.enquiry_response_target || "Not published"}</p><form className="mt-4 flex flex-wrap gap-3" onSubmit={(e) => { e.preventDefault(); saveTarget.mutate(); }}><div className="min-w-0 flex-1"><Label htmlFor="enquiry-response-target">New target (leave blank to clear)</Label><Input id="enquiry-response-target" maxLength={160} value={responseTarget} onChange={(e) => setResponseTarget(e.target.value)} placeholder="Enter your agreed response timeframe" /></div><Button className="self-end" disabled={saveTarget.isPending}>Save target</Button></form></section>
    <section className="rounded-xl border bg-white p-5 sm:p-6"><h3 className="text-lg font-semibold text-[#0F2444]">Business backup &amp; restore</h3><p className="mt-2 text-sm text-slate-600">Download a backup weekly and before bulk changes. It includes business records, billing details and available attachments. Keep it private on a second device or secure storage. Login credentials, email settings, analytics and hosting configuration are excluded.</p><p className="mt-2 text-sm text-slate-600">Pause team edits during backup or restore. Restore adds missing records and keeps existing records, including saved invoices and payroll. It cannot roll existing records back to an earlier version. Keep a database backup separately for full recovery.</p>
      <Button type="button" className="mt-4" disabled={busy} onClick={() => void downloadBackup()}>{busy ? "Working…" : "Download business backup"}</Button>
      <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]"><div><Label htmlFor="backup-file">Choose a BWS backup ZIP (max 64 MB)</Label><Input ref={input} id="backup-file" type="file" accept=".zip,application/zip" disabled={busy} onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); setResult(""); }} /></div><Button className="self-end" variant="outline" disabled={busy || !file} onClick={() => void inspect()}>Preview restore</Button></div>
      {preview && <div className="mt-4 rounded-lg border p-4"><p className="font-semibold">Backup created {new Date(preview.created_at).toLocaleString()}</p><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Records</th><th className="p-2">To add</th><th className="p-2">Already saved</th></tr></thead><tbody>{Object.entries(preview.counts).map(([key, value]) => <tr key={key} className="border-t"><td className="p-2">{key.replaceAll("_", " ")}</td><td className="p-2">{value.new}</td><td className="p-2">{value.existing}</td></tr>)}</tbody></table></div>{preview.missing_resumes > 0 && <p className="mt-3 text-sm text-amber-800">{preview.missing_resumes} resumes are missing from this backup.</p>}<Button type="button" className="mt-4" disabled={busy} onClick={() => void restore()}>Restore missing records</Button></div>}
      {result && <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-700" role="status">{result}</p>}
    </section>
  </div>;
}

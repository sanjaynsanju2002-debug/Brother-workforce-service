import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Globe,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import type { EmailDomain, EmailStatus, TestEmailResult } from "@/types";

function apiMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { detail?: unknown } | null;
    if (body && typeof body.detail === "string") return body.detail;
  }
  return fallback;
}

function statusTone(status: string): { label: string; className: string } {
  const s = status.toLowerCase();
  if (s === "verified") return { label: "Verified", className: "bg-green-600 text-white" };
  if (s === "failed") return { label: "Failed", className: "bg-red-600 text-white" };
  if (s === "temporary_failure")
    return { label: "Retrying", className: "bg-amber-500 text-white" };
  if (s === "pending") return { label: "Pending DNS", className: "bg-amber-500 text-white" };
  return { label: "Not started", className: "bg-slate-500 text-white" };
}

export default function EmailSettings({ pin }: { pin: string }) {
  const qc = useQueryClient();
  const q = `?pin=${encodeURIComponent(pin)}`;
  const key = ["admin-email", pin];

  const status = useQuery({ queryKey: key, queryFn: () => apiGet<EmailStatus>(`/admin/email/status${q}`) });

  const [domainName, setDomainName] = useState("");
  const [sender, setSender] = useState("");
  const [recipients, setRecipients] = useState("");
  const [testTo, setTestTo] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const addDomain = useMutation({
    mutationFn: (name: string) => apiPost<EmailDomain>(`/admin/email/domains${q}`, { name }),
    onSuccess: () => {
      setDomainName("");
      refresh();
      toast.success("Domain added — now publish the DNS records below");
    },
    onError: (e) => toast.error(apiMessage(e, "Could not add that domain")),
  });

  const verify = useMutation({
    mutationFn: (id: string) => apiPost<EmailDomain>(`/admin/email/domains/${id}/verify${q}`),
    onSuccess: (d) => {
      refresh();
      if (d.status.toLowerCase() === "verified") toast.success(`${d.name} is verified`);
      else toast.info(`${d.name}: ${statusTone(d.status).label}. DNS can take up to 48 hours.`);
    },
    onError: (e) => toast.error(apiMessage(e, "Verification check failed")),
  });

  const removeDomain = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/admin/email/domains/${id}${q}`),
    onSuccess: () => {
      refresh();
      toast.success("Domain removed");
    },
    onError: (e) => toast.error(apiMessage(e, "Could not remove domain")),
  });

  const saveSettings = useMutation({
    mutationFn: (body: { sender: string; recipients: string[] }) =>
      apiPut<EmailStatus>(`/admin/email/settings${q}`, body),
    onSuccess: () => {
      setSender("");
      setRecipients("");
      refresh();
      toast.success("Email settings saved");
    },
    onError: (e) => toast.error(apiMessage(e, "Could not save settings")),
  });

  const sendTest = useMutation({
    mutationFn: (to: string) => apiPost<TestEmailResult>(`/admin/email/test${q}`, { to: to || null }),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Test email sent to ${r.sent_to.join(", ")}`);
      else toast.error(r.detail ?? "Test email failed");
    },
    onError: (e) => toast.error(apiMessage(e, "Test email failed")),
  });

  const s = status.data;

  return (
    <div className="grid gap-6" data-testid="email-settings-panel">
      {/* Current state */}
      <Card className="border-slate-200 bg-white">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-semibold text-[#0F2444]">
                <Mail className="h-5 w-5 text-[#EA580C]" /> Email Delivery
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Alerts are sent from your server. The API key stays on the backend and is never shown here.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => refresh()}
              disabled={status.isFetching}
              data-testid="email-refresh"
            >
              {status.isFetching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-slate-200 bg-[#F8FAFC] p-4">
              <p className="text-xs uppercase tracking-widest text-slate-500">API Key</p>
              <p
                className="mt-1 flex items-center gap-1.5 font-semibold"
                data-testid="email-key-status"
              >
                {s?.key_configured ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-green-700">Configured</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="text-amber-700">Missing</span>
                  </>
                )}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-[#F8FAFC] p-4">
              <p className="text-xs uppercase tracking-widest text-slate-500">Sending From</p>
              <p className="mt-1 break-all font-semibold text-[#0F2444]" data-testid="email-current-sender">
                {s?.sender ?? "—"}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-[#F8FAFC] p-4">
              <p className="text-xs uppercase tracking-widest text-slate-500">Alerts Go To</p>
              <p className="mt-1 break-all font-semibold text-[#0F2444]" data-testid="email-current-recipients">
                {s?.recipients?.join(", ") ?? "—"}
              </p>
            </div>
          </div>

          {s?.using_shared_sender && (
            <div
              className="mt-4 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
              data-testid="email-shared-sender-warning"
            >
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <strong>You are using Resend's shared sender.</strong> It can only deliver to the Gmail
                address that owns your Resend account. Add and verify your own domain below to send alerts
                to any staff inbox.
              </div>
            </div>
          )}

          {s?.key_restricted && (
            <div
              className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"
              data-testid="email-restricted-key-notice"
            >
              <p className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4 text-blue-600" />
                Your Resend key is send-only
              </p>
              <p className="mt-2">
                Sending alerts works perfectly. Adding a domain from this page needs a Full Access key.
                Two ways forward:
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>
                  In Resend go to <strong>API Keys → Create API Key → Full access</strong>, then send the
                  new key to your developer to replace <code>RESEND_API_KEY</code>. The domain tools here
                  will then work.
                </li>
                <li>
                  Or add the domain yourself in the Resend dashboard under <strong>Domains → Add Domain</strong>,
                  publish the DNS records it shows, and once it says Verified, set the from-address below to
                  <code> alerts@yourdomain.com</code>.
                </li>
              </ol>
            </div>
          )}

          {s?.error && !s.key_restricted && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              Resend error: {s.error}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-5">
            <div className="min-w-[240px] flex-1">
              <Label className="mb-2 block text-sm">Send a test email to</Label>
              <Input
                placeholder={s?.recipients?.[0] ?? "you@example.com"}
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                data-testid="email-test-input"
              />
            </div>
            <Button
              onClick={() => sendTest.mutate(testTo)}
              disabled={sendTest.isPending || !s?.key_configured}
              className="bg-[#EA580C] text-white hover:bg-[#C2410C]"
              data-testid="email-test-send"
            >
              {sendTest.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send Test
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Domain management */}
      <Card className="border-slate-200 bg-white">
        <CardContent className="p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-[#0F2444]">
            <Globe className="h-5 w-5 text-[#EA580C]" /> Sending Domains
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Add the domain you own, publish the DNS records at your registrar (GoDaddy, Namecheap,
            Hostinger…), then press Verify. DNS changes usually apply within an hour.
          </p>

          <div className="mt-5 flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <Label className="mb-2 block text-sm">Domain name</Label>
              <Input
                placeholder="brothersworkforce.in"
                value={domainName}
                onChange={(e) => setDomainName(e.target.value)}
                data-testid="email-domain-input"
              />
            </div>
            <Button
              onClick={() => addDomain.mutate(domainName)}
              disabled={addDomain.isPending || !domainName.trim() || !s?.key_configured}
              className="bg-[#0F2444] text-white hover:bg-[#0A172C]"
              data-testid="email-domain-add"
            >
              {addDomain.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Add Domain
            </Button>
          </div>

          {(s?.domains?.length ?? 0) === 0 ? (
            <p
              className="mt-6 rounded-md border border-dashed border-slate-300 bg-[#F8FAFC] p-6 text-center text-sm text-slate-500"
              data-testid="email-domains-empty"
            >
              No sending domain yet. Alerts will keep arriving at your Gmail through Resend's shared
              sender until you add one.
            </p>
          ) : (
            <div className="mt-6 grid gap-5">
              {s!.domains.map((d) => {
                const tone = statusTone(d.status);
                return (
                  <div
                    key={d.id}
                    className="rounded-md border border-slate-200 bg-[#F8FAFC] p-5"
                    data-testid={`email-domain-${d.id}`}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-semibold text-[#0F2444]">{d.name}</span>
                      <Badge className={tone.className}>{tone.label}</Badge>
                      <div className="ml-auto flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => verify.mutate(d.id)}
                          disabled={verify.isPending}
                          data-testid={`email-domain-verify-${d.id}`}
                        >
                          {verify.isPending ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-3.5 w-3.5" />
                          )}
                          Verify
                        </Button>
                        {d.status.toLowerCase() === "verified" && (
                          <Button
                            size="sm"
                            className="bg-[#0F2444] text-white hover:bg-[#0A172C]"
                            onClick={() =>
                              saveSettings.mutate({
                                sender: `alerts@${d.name}`,
                                recipients: s!.recipients,
                              })
                            }
                            data-testid={`email-domain-use-${d.id}`}
                          >
                            Send from this domain
                          </Button>
                        )}
                        <Button
                          size="icon-sm"
                          variant="destructive"
                          onClick={() => removeDomain.mutate(d.id)}
                          data-testid={`email-domain-remove-${d.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {d.records.length > 0 && (
                      <div className="mt-4 overflow-x-auto">
                        <p className="mb-2 text-xs uppercase tracking-widest text-slate-500">
                          DNS records to add at your registrar
                        </p>
                        <Table data-testid={`email-domain-records-${d.id}`}>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Type</TableHead>
                              <TableHead>Name / Host</TableHead>
                              <TableHead>Value</TableHead>
                              <TableHead>TTL</TableHead>
                              <TableHead></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {d.records.map((r, i) => (
                              <TableRow key={i}>
                                <TableCell className="font-medium">{r.type ?? "—"}</TableCell>
                                <TableCell className="break-all font-mono text-xs">{r.name ?? "—"}</TableCell>
                                <TableCell className="max-w-[320px] break-all font-mono text-xs">
                                  {r.value ?? "—"}
                                </TableCell>
                                <TableCell>{r.ttl ?? "Auto"}</TableCell>
                                <TableCell>
                                  <Button
                                    size="icon-xs"
                                    variant="outline"
                                    onClick={() => {
                                      navigator.clipboard?.writeText(r.value ?? "");
                                      toast.success("Value copied");
                                    }}
                                    aria-label="Copy value"
                                    data-testid={`email-record-copy-${d.id}-${i}`}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual override */}
      <Card className="border-slate-200 bg-white">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-[#0F2444]">Sender & Recipients</h3>
          <p className="mt-1 text-sm text-slate-500">
            Change the from-address (must be on a verified domain) and who receives alerts. Separate
            multiple recipients with commas.
          </p>
          <form
            className="mt-5 grid gap-4 sm:grid-cols-2"
            data-testid="email-settings-form"
            onSubmit={(e) => {
              e.preventDefault();
              saveSettings.mutate({
                sender: sender.trim() || (s?.sender ?? ""),
                recipients: (recipients.trim() || (s?.recipients ?? []).join(","))
                  .split(",")
                  .map((r) => r.trim())
                  .filter(Boolean),
              });
            }}
          >
            <div>
              <Label className="mb-2 block text-sm">Send alerts from</Label>
              <Input
                placeholder={s?.sender ?? "alerts@yourdomain.com"}
                value={sender}
                onChange={(e) => setSender(e.target.value)}
                data-testid="email-sender-input"
              />
            </div>
            <div>
              <Label className="mb-2 block text-sm">Deliver alerts to</Label>
              <Input
                placeholder={(s?.recipients ?? []).join(", ")}
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                data-testid="email-recipients-input"
              />
            </div>
            <div className="sm:col-span-2">
              <Button
                type="submit"
                disabled={saveSettings.isPending}
                className="bg-[#EA580C] text-white hover:bg-[#C2410C]"
                data-testid="email-settings-save"
              >
                {saveSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Settings
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

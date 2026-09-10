import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Eye, EyeOff, ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
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
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { Client } from "@/types";

function apiMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { detail?: unknown } | null;
    if (body && typeof body.detail === "string") return body.detail;
  }
  return fallback;
}

const EMPTY = { name: "", industry: "", location: "", headcount: "" };

export default function ClientsManager({ pin }: { pin: string }) {
  const qc = useQueryClient();
  const q = `?pin=${encodeURIComponent(pin)}`;
  const key = ["admin-clients", pin];

  const clients = useQuery({ queryKey: key, queryFn: () => apiGet<Client[]>(`/admin/clients${q}`) });
  const [form, setForm] = useState(EMPTY);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["clients"] });
  };

  const create = useMutation({
    mutationFn: (body: typeof EMPTY) =>
      apiPost<Client>(`/admin/clients${q}`, { ...body, visible: true }),
    onSuccess: () => {
      setForm(EMPTY);
      refresh();
      toast.success("Client added");
    },
    onError: (e) => toast.error(apiMessage(e, "Could not add client")),
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; visible: boolean }) =>
      apiPatch<Client>(`/admin/clients/${v.id}${q}`, { visible: v.visible }),
    onSuccess: refresh,
    onError: (e) => toast.error(apiMessage(e, "Could not update client")),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/admin/clients/${id}${q}`),
    onSuccess: () => {
      refresh();
      toast.success("Client removed");
    },
    onError: (e) => toast.error(apiMessage(e, "Could not remove client")),
  });

  const uploadLogo = useMutation({
    mutationFn: async (v: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append("file", v.file);
      const res = await fetch(`/api/admin/clients/${v.id}/logo${q}`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Logo upload failed");
      return (await res.json()) as Client;
    },
    onSuccess: () => {
      refresh();
      toast.success("Logo uploaded");
    },
    onError: () => toast.error("Could not upload that logo"),
  });

  const rows = clients.data ?? [];

  return (
    <div className="grid gap-6" data-testid="clients-manager">
      <Card className="border-slate-200 bg-white">
        <CardContent className="p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-[#0F2444]">
            <Building2 className="h-5 w-5 text-[#EA580C]" /> Add a Client
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Only publish a company name or logo once you have their written permission. Sector-style
            entries such as "Auto Component Manufacturer" are always safe to show.
          </p>
          <form
            className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            data-testid="client-add-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.name.trim()) {
                toast.error("Name is required");
                return;
              }
              create.mutate(form);
            }}
          >
            <div>
              <Label className="mb-2 block text-sm">Name / Sector *</Label>
              <Input
                placeholder="Auto Component Manufacturer"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="client-input-name"
              />
            </div>
            <div>
              <Label className="mb-2 block text-sm">Industry</Label>
              <Input
                placeholder="Automobile"
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                data-testid="client-input-industry"
              />
            </div>
            <div>
              <Label className="mb-2 block text-sm">Location</Label>
              <Input
                placeholder="Nanjangud Industrial Area"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                data-testid="client-input-location"
              />
            </div>
            <div>
              <Label className="mb-2 block text-sm">Workforce Deployed</Label>
              <Input
                placeholder="80+ workers"
                value={form.headcount}
                onChange={(e) => setForm({ ...form, headcount: e.target.value })}
                data-testid="client-input-headcount"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button
                type="submit"
                disabled={create.isPending}
                className="bg-[#EA580C] text-white hover:bg-[#C2410C]"
                data-testid="client-add-submit"
              >
                {create.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Add Client
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
        <CardContent className="p-0">
          <Table data-testid="clients-table">
            <TableHeader>
              <TableRow>
                <TableHead>Logo</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Deployed</TableHead>
                <TableHead>Shown</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-slate-500">
                    No clients yet. The public site shows placeholder cards until you add one.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((c) => (
                <TableRow key={c.id} data-testid={`client-row-${c.id}`}>
                  <TableCell>
                    {c.logo_filename ? (
                      <img
                        src={`/api/clients/${c.id}/logo`}
                        alt={c.name}
                        className="h-9 w-9 rounded object-contain"
                      />
                    ) : (
                      <Building2 className="h-6 w-6 text-slate-300" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium text-[#0F2444]">{c.name}</TableCell>
                  <TableCell>{c.industry || "—"}</TableCell>
                  <TableCell>{c.location || "—"}</TableCell>
                  <TableCell>{c.headcount || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={c.visible ? "default" : "secondary"}>
                      {c.visible ? "Visible" : "Hidden"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <label
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-[#EA580C] hover:text-[#EA580C]"
                        data-testid={`client-logo-label-${c.id}`}
                      >
                        <ImagePlus className="h-3.5 w-3.5" /> Logo
                        <input
                          type="file"
                          className="hidden"
                          accept=".png,.jpg,.jpeg,.webp,.svg"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadLogo.mutate({ id: c.id, file });
                          }}
                          data-testid={`client-logo-input-${c.id}`}
                        />
                      </label>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => toggle.mutate({ id: c.id, visible: !c.visible })}
                        data-testid={`client-toggle-${c.id}`}
                      >
                        {c.visible ? (
                          <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                        ) : (
                          <Eye className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {c.visible ? "Hide" : "Show"}
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="destructive"
                        onClick={() => remove.mutate(c.id)}
                        data-testid={`client-delete-${c.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

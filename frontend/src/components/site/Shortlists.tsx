import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ListChecks, Loader2, MessageSquare, Plus, Trash2, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiDelete, apiGet, apiPost } from "@/lib/api";
import { waLink, workerMessage } from "@/lib/wa";
import type { Shortlist, Worker } from "@/types";

function apiMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { detail?: unknown } | null;
    if (body && typeof body.detail === "string") return body.detail;
  }
  return fallback;
}

export default function Shortlists({ pin }: { pin: string }) {
  const qc = useQueryClient();
  const q = `?pin=${encodeURIComponent(pin)}`;
  const key = ["admin-shortlists", pin];

  const lists = useQuery({ queryKey: key, queryFn: () => apiGet<Shortlist[]>(`/admin/shortlists${q}`) });
  const [name, setName] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const members = useQuery({
    queryKey: ["shortlist-members", pin, openId],
    queryFn: () => apiGet<Worker[]>(`/admin/shortlists/${openId}/workers${q}`),
    enabled: !!openId,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["shortlist-members", pin] });
  };

  const create = useMutation({
    mutationFn: (n: string) => apiPost<Shortlist>(`/admin/shortlists${q}`, { name: n }),
    onSuccess: () => {
      setName("");
      refresh();
      toast.success("Shortlist created");
    },
    onError: (e) => toast.error(apiMessage(e, "Could not create shortlist")),
  });

  const removeList = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/admin/shortlists/${id}${q}`),
    onSuccess: () => {
      setOpenId(null);
      refresh();
      toast.success("Shortlist deleted");
    },
  });

  const removeMember = useMutation({
    mutationFn: (v: { id: string; workerId: string }) =>
      apiDelete<Shortlist>(`/admin/shortlists/${v.id}/workers/${v.workerId}${q}`),
    onSuccess: () => {
      refresh();
      toast.success("Candidate removed");
    },
  });

  const rows = lists.data ?? [];

  return (
    <div className="grid gap-6" data-testid="shortlists-panel">
      <Card className="border-slate-200 bg-white">
        <CardContent className="p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-[#0F2444]">
            <ListChecks className="h-5 w-5 text-[#EA580C]" /> Create a Shortlist
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Group candidates per client requirement, then export just that list to send to the company.
          </p>
          <form
            className="mt-5 flex flex-wrap items-end gap-3"
            data-testid="shortlist-create-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) {
                toast.error("Give the shortlist a name");
                return;
              }
              create.mutate(name);
            }}
          >
            <div className="min-w-[260px] flex-1">
              <Label className="mb-2 block text-sm">Shortlist name</Label>
              <Input
                placeholder="e.g. Nanjangud — 25 CNC Operators"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="shortlist-name-input"
              />
            </div>
            <Button
              type="submit"
              disabled={create.isPending}
              className="bg-[#EA580C] text-white hover:bg-[#C2410C]"
              data-testid="shortlist-create-submit"
            >
              {create.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Create
            </Button>
          </form>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <p
          className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500"
          data-testid="shortlists-empty"
        >
          No shortlists yet. Create one above, then use "Add to shortlist" on the Worker Applications tab.
        </p>
      ) : (
        <div className="grid gap-4">
          {rows.map((sl) => (
            <Card key={sl.id} className="border-slate-200 bg-white" data-testid={`shortlist-${sl.id}`}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold text-[#0F2444]">{sl.name}</span>
                  <Badge variant="secondary" data-testid={`shortlist-count-${sl.id}`}>
                    {sl.worker_ids.length} candidate{sl.worker_ids.length === 1 ? "" : "s"}
                  </Badge>
                  <div className="ml-auto flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setOpenId(openId === sl.id ? null : sl.id)}
                      data-testid={`shortlist-open-${sl.id}`}
                    >
                      {openId === sl.id ? "Hide" : "View"}
                    </Button>
                    <a
                      href={`/api/admin/shortlists/${sl.id}/export.csv${q}`}
                      className="inline-flex items-center gap-2 rounded-md bg-[#0F2444] px-3 py-2 text-xs font-semibold text-white transition-transform duration-150 hover:bg-[#0A172C] active:scale-98"
                      data-testid={`shortlist-export-${sl.id}`}
                    >
                      <Download className="h-3.5 w-3.5" /> Export
                    </a>
                    <Button
                      size="icon-sm"
                      variant="destructive"
                      onClick={() => removeList.mutate(sl.id)}
                      data-testid={`shortlist-delete-${sl.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {openId === sl.id && (
                  <div className="mt-4 border-t border-slate-200 pt-4" data-testid={`shortlist-members-${sl.id}`}>
                    {(members.data ?? []).length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Empty. Add candidates from the Worker Applications tab.
                      </p>
                    ) : (
                      <div className="grid gap-2">
                        {(members.data ?? []).map((w) => (
                          <div
                            key={w.id}
                            className="flex flex-wrap items-center gap-3 rounded-md bg-[#F8FAFC] px-3 py-2 text-sm"
                          >
                            <span className="font-medium text-[#0F2444]">{w.full_name}</span>
                            <span className="text-slate-500">{w.mobile}</span>
                            <span className="text-slate-500">{w.skill_category}</span>
                            <span className="text-slate-500">{w.current_location}</span>
                            <div className="ml-auto flex gap-2">
                              <a
                                href={waLink(w.whatsapp || w.mobile, workerMessage(w.full_name))}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-md bg-[#16A34A] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#15803D]"
                                data-testid={`shortlist-wa-${w.id}`}
                              >
                                <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                              </a>
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => removeMember.mutate({ id: sl.id, workerId: w.id })}
                                data-testid={`shortlist-remove-${w.id}`}
                              >
                                <UserMinus className="mr-1.5 h-3.5 w-3.5" /> Remove
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

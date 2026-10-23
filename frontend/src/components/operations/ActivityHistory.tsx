import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet } from "@/lib/api";
import { OPS } from "@/lib/operations";
import { Heading, QueryStatus } from "./Common";
import { box } from "@/lib/operations";
type Event = { id: string; at: string; actor: string; role: string; method: string; path: string; action: string; subject?: string };
export default function ActivityHistory() {
  const [page, setPage] = useState(1); const [search, setSearch] = useState("");
  const query = useQuery({ queryKey: ["ops", "activity", page, search], queryFn: () => apiGet<{ items: Event[]; total: number }>(`${OPS}/activity?page=${page}&q=${encodeURIComponent(search)}`) });
  return <section className="space-y-5" data-testid="activity-history-panel"><Heading title="Staff Activity" text="See successful changes made by signed-in staff from this update onward. Payment corrections also keep their original entries and reasons in their registers." />
    <Input aria-label="Search staff activity" placeholder="Search staff name, record or section" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
    <QueryStatus pending={query.isPending} error={query.error} retry={() => query.refetch()} />
    {query.data && <div className={`${box} space-y-4`}>{!query.data.items.length && <p className="text-sm text-slate-500">No matching activity recorded.</p>}{query.data.items.map((e) => <article key={e.id} className="border-b pb-4"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-semibold">{e.actor} <span className="font-normal text-slate-500">· {e.role}</span></p><time dateTime={e.at} className="text-xs text-slate-500">{new Date(e.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</time></div><p className="mt-1 text-sm">{e.action}{e.subject && ` · ${e.subject}`}</p><p className="mt-1 break-all text-xs text-slate-500">{e.path}</p></article>)}<div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p>{query.data.total} events · Page {page}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page * 50 >= query.data.total} onClick={() => setPage(page + 1)}>Next</Button></div></div></div>}
  </section>;
}

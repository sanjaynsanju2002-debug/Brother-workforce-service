import { useQuery } from "@tanstack/react-query";
import { BellRing, MessageSquare, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiGet } from "@/lib/api";
import { jobAlertMessage, waLink } from "@/lib/wa";
import type { Job, Worker } from "@/types";

export default function JobMatches({ pin, job }: { pin: string; job: Job }) {
  const q = `?pin=${encodeURIComponent(pin)}`;
  const matches = useQuery({
    queryKey: ["job-matches", pin, job.id],
    queryFn: () => apiGet<Worker[]>(`/admin/jobs/${job.id}/matches${q}`),
  });

  const rows = matches.data ?? [];
  const firstToken = (job.location || "").split(",")[0].trim().toLowerCase();
  const isLocal = (w: Worker) =>
    !!firstToken &&
    `${w.current_location ?? ""} ${w.preferred_location ?? ""}`.toLowerCase().includes(firstToken);

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-[#F8FAFC] p-4" data-testid={`job-matches-${job.id}`}>
      <p className="flex items-center gap-2 text-sm font-semibold text-[#0F2444]">
        <BellRing className="h-4 w-4 text-[#EA580C]" />
        {matches.isLoading
          ? "Finding matching candidates…"
          : `${rows.length} matching candidate${rows.length === 1 ? "" : "s"} for ${job.title}`}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Matched on skill category, nearest location first. Tap WhatsApp to send the job details.
      </p>

      {!matches.isLoading && rows.length === 0 && (
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-500" data-testid={`job-matches-empty-${job.id}`}>
          <Users className="h-4 w-4" /> No registered candidates in this skill category yet.
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-3 grid gap-2">
          {rows.slice(0, 20).map((w) => (
            <div
              key={w.id}
              className="flex flex-wrap items-center gap-3 rounded-md bg-white px-3 py-2 text-sm"
              data-testid={`job-match-${job.id}-${w.id}`}
            >
              <span className="font-medium text-[#0F2444]">{w.full_name}</span>
              <span className="text-slate-500">{w.mobile}</span>
              <span className="text-slate-500">{w.current_location}</span>
              {isLocal(w) && <Badge className="bg-green-600 text-[10px] text-white">Nearby</Badge>}
              {w.availability && (
                <Badge variant="secondary" className="text-[10px]">
                  {w.availability}
                </Badge>
              )}
              <a
                href={waLink(w.whatsapp || w.mobile, jobAlertMessage(w.full_name, job))}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-[#16A34A] px-2.5 py-1.5 text-xs font-semibold text-white transition-transform duration-150 hover:bg-[#15803D] active:scale-98"
                data-testid={`job-match-wa-${job.id}-${w.id}`}
              >
                <MessageSquare className="h-3.5 w-3.5" /> Send Alert
              </a>
            </div>
          ))}
          {rows.length > 20 && (
            <p className="text-xs text-slate-500">Showing the closest 20 of {rows.length} matches.</p>
          )}
        </div>
      )}
    </div>
  );
}

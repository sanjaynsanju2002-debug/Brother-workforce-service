import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Button } from "@/components/ui/button";
type Status = { database_host: string; database_name: string; jobs_total: number; release: string; recruitment_review_count: number; review_note: string; backup_note: string; attendance_deliveries: { report_date: string; status: string; updated_at: string }[] };
export default function SystemStatus() {
  const query = useQuery({ queryKey: ["system-status"], queryFn: () => apiGet<Status>("/admin/system/status") });
  const data = query.data;
  return <section className="rounded-xl border bg-white p-5 sm:p-6"><h3 className="text-lg font-semibold">Operations &amp; recovery</h3><p className="mt-2 text-sm text-slate-600">Owner-only checks for data mapping, scheduled reports and record reviews.</p>
    {query.isError && <p role="alert" className="mt-3 text-red-700">Checks could not load. <Button variant="outline" onClick={() => query.refetch()}>Retry</Button></p>}
    {data && <div className="mt-4 space-y-4 text-sm"><details><summary className="cursor-pointer font-semibold">Production database and release</summary><dl className="mt-2 break-all"><dt>Database host</dt><dd>{data.database_host}</dd><dt>Database name</dt><dd>{data.database_name}</dd><dt>Total jobs</dt><dd>{data.jobs_total}</dd><dt>Release</dt><dd>{data.release}</dd></dl></details>
      <div><p className="font-semibold">Recruitment retention review: {data.recruitment_review_count} profiles older than one year</p><p className="mt-1 text-slate-600">{data.review_note}</p></div>
      <div><p className="font-semibold">Recent attendance report deliveries</p>{data.attendance_deliveries.length ? data.attendance_deliveries.map((d, i) => <p key={i} className={d.status === "failed" ? "text-red-700" : "text-slate-600"}>{d.report_date}: {d.status}</p>) : <p className="text-amber-800">No delivery history. Verify recipient settings and the report schedule.</p>}</div>
      <p className="rounded-lg bg-amber-50 p-3 text-amber-900">{data.backup_note}</p></div>}
  </section>;
}

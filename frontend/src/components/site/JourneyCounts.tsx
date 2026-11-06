import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
const labels: Record<string, string> = { candidate_start: "Application started", candidate_saved: "Application saved", employer_start: "Enquiry started", employer_saved: "Enquiry saved", job_view: "Job viewed", call_click: "Call clicked", whatsapp_click: "WhatsApp clicked" };
export default function JourneyCounts() {
  const query = useQuery({ queryKey: ["journey-counts"], queryFn: () => apiGet<{ counts: Record<string, number> }>("/admin/journey") });
  return <section className="rounded-xl border bg-white p-5"><h3 className="font-semibold">Website journeys · last 30 days</h3><p className="mt-1 text-sm text-slate-600">Anonymous action counts since this release. These are approximate, not unique people or confirmed calls.</p>{query.isError && <p role="alert">Activity counts could not load.</p>}<dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">{Object.entries(query.data?.counts || {}).map(([key, count]) => <div key={key}><dt className="text-sm text-slate-600">{labels[key]}</dt><dd className="text-2xl font-semibold">{count}</dd></div>)}</dl></section>;
}

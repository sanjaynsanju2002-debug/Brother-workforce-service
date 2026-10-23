import { missingJobDetails } from "@/lib/jobContent";
import { missingJobSearchDetails } from "@/lib/jobValidation";
import type { JobCreate } from "@/types";

export function CandidateDetailsStatus({ job }: { job: JobCreate }) {
  const missing = missingJobDetails(job);
  return <div role="status" className={`rounded-lg border p-3 text-sm ${missing.length ? "border-amber-200 bg-amber-50 text-amber-900" : "border-green-200 bg-green-50 text-green-900"}`} data-testid="job-candidate-status">
    {missing.length ? <><p>Candidate details to complete: {missing.join(", ")}.</p><p className="mt-1">Enter confirmed information; use “None” only when confirmed.</p></>
      : <p>All candidate detail fields are filled. Review the information before saving.</p>}
  </div>;
}

export function JobSearchVerification({ job, onChange }: { job: JobCreate; onChange: (checked: boolean) => void }) {
  const missing = missingJobSearchDetails(job);
  return <div className="space-y-2">
    <label className="flex items-start gap-3 text-sm"><input className="mt-1 h-5 w-5" type="checkbox" checked={job.schema_ready || false} onChange={(event) => onChange(event.target.checked)} aria-describedby="job-search-help" data-testid="job-search-verification" /><span>I verified the full description, qualification, working hours, hiring company and location for job search listings.</span></label>
    <p id="job-search-help" className="text-xs text-slate-600">This option is optional. Leave it off if the hiring company is confidential; you can still save the job on your website.</p>
    {!!job.schema_ready && missing.length > 0 && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="job-search-missing">Job search details to complete: {missing.join(", ")}.</p>}
  </div>;
}

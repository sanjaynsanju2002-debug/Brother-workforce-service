import { ApiError } from "@/lib/api";
import type { JobCreate } from "@/types";

export function missingJobSearchDetails(job: JobCreate): string[] {
  const missing = ([
    ["job title", job.title], ["location", job.location], ["hiring company", job.employer_name],
    ["qualification / eligibility", job.qualification], ["working hours / days", job.working_hours],
  ] as const).filter(([, value]) => !value?.trim()).map(([label]) => label as string);
  if ((job.description || "").trim().length < 100) missing.push("full job description (at least 100 characters)");
  return missing;
}

export function jobValidationError(job: JobCreate, editing: boolean): string | null {
  if (!job.title.trim() || !job.location.trim()) return "Title and location are required";
  if (!Number.isInteger(job.openings) || job.openings < 1) return "Enter at least 1 opening";
  if (!editing && (job.description || "").trim().length < 40) return "Add a full job description with duties, qualifications, skills and working hours";
  if (job.schema_ready) {
    const missing = missingJobSearchDetails(job);
    if (missing.length) return `For job search listings, complete: ${missing.join(", ")}. You can turn off job search verification and save the job on your website.`;
  }
  return null;
}

export function jobSaveError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Your admin session expired. Sign in again to save this job.";
    if (error.status === 403) return "Your account does not have permission to save jobs.";
    const detail = (error.body as { detail?: unknown } | null)?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const messages = detail.flatMap((item: unknown) => {
        const msg = item && typeof item === "object" && "msg" in item ? item.msg : null;
        return typeof msg === "string" ? [msg.replace(/^Value error, /, "")] : [];
      });
      if (messages.length) return [...new Set(messages)].join(". ");
    }
  }
  return "Could not save the job. Please try again.";
}

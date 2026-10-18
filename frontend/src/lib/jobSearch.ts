import type { Job } from "@/types";

export type JobFilters = { search: string; location: string; qualification: string; shift: string };
export function searchJobs(jobs: Job[], filters: JobFilters): Job[] {
  const term = filters.search.trim().toLocaleLowerCase();
  return jobs.filter((j) =>
    (!filters.location || j.location.trim() === filters.location.trim()) &&
    (!filters.qualification || (j.qualification || "").trim() === filters.qualification.trim()) &&
    (!filters.shift || (j.shift || "").trim() === filters.shift.trim()) &&
    `${j.title} ${j.title_kn || ""} ${j.location} ${j.location_kn || ""} ${j.skill_category} ${j.qualification || ""} ${j.qualification_kn || ""} ${j.description || ""} ${j.description_kn || ""}`.toLocaleLowerCase().includes(term),
  );
}

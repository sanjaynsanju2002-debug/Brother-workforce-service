import type { Worker } from "@/types";

export const QUALIFICATION_SUGGESTIONS = [
  "SSLC / 10th", "PUC / 12th", "ITI - Fitter", "ITI - Electrician", "Diploma - Mechanical",
  "Diploma - Electrical", "B.A.", "B.Com.", "B.Sc.", "B.B.A.", "B.C.A.", "B.E. / B.Tech.",
  "MBA", "M.Com.", "M.Sc.", "Below SSLC", "No formal qualification",
];

export const QUALIFICATION_FILTERS = [
  { value: "sslc", label: "SSLC / 10th" },
  { value: "puc", label: "PUC / 12th" },
  { value: "iti", label: "ITI" },
  { value: "diploma", label: "Diploma" },
  { value: "degree", label: "Degree (any)" },
  { value: "postgraduate", label: "Postgraduate" },
  { value: "other", label: "Other qualifications / below SSLC" },
  { value: "missing", label: "Not provided" },
] as const;
export type QualificationFilter = "" | typeof QUALIFICATION_FILTERS[number]["value"];

const postgraduate = /\b(?:mba|mcom|msc|mca|mtech|mpharm|med|phd|masters?|post\s*graduat\w*|m\s+(?:ba|com|sc|ca|tech|pharm|ed))\b/;
const qualificationPatterns = {
  sslc: /\b(?:s\s*s\s*l\s*c|10(?:th)?(?:\s*(?:std|standard|class))?|class\s*10)\b/,
  puc: /\b(?:p\s*u\s*c|12(?:th)?(?:\s*(?:std|standard|class))?|class\s*12|hsc)\b/,
  iti: /\b(?:i\s*t\s*i|industrial training institute)\b/,
  diploma: /\bdiploma\b/,
  degree: /\b(?:bcom|bsc|btech|bba|bca|bpharm|barch|bachelors?|degree|graduate|graduation|b\s+(?:com|sc|tech|e|a|ba|ca|pharm|arch))\b|^(?:be|ba)(?:\s|$)/,
  postgraduate,
};

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\./g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function matchesQualification(education: string | null | undefined, filter: QualificationFilter): boolean {
  if (!filter) return true;
  const value = normalized(education || "");
  const missing = !value || /^(?:not provided|not specified|unknown|na|n a)$/.test(value);
  if (filter === "missing") return missing;
  if (missing) return false;
  // Keep explicit unfinished qualifications out of completed-level filters.
  const unfinished = /\b(?:(?:below|under)\s+(?:sslc|10(?:th)?)|pursuing|in progress|not completed|incomplete|failed|dropout|discontinued)\b/.test(value);
  if (unfinished) return filter === "other";
  if (filter === "other") return !Object.values(qualificationPatterns).some((pattern) => pattern.test(value));
  if (filter === "degree" && postgraduate.test(value)) return true;
  return qualificationPatterns[filter].test(value);
}

export function filterTalents(talents: Worker[], filters: { search: string; region: string; qualification: QualificationFilter }): Worker[] {
  const search = normalized(filters.search);
  const region = normalized(filters.region);
  const phone = filters.search.replace(/\D/g, "");
  const phoneSearch = phone.length >= 4 && !/[\p{L}]/u.test(filters.search);
  return talents.filter((talent) =>
    matchesQualification(talent.education, filters.qualification) &&
    normalized(`${talent.current_location} ${talent.preferred_location || ""}`).includes(region) &&
    (!search || normalized(`${talent.full_name} ${talent.mobile} ${talent.whatsapp || ""} ${talent.education || ""} ${talent.skills || ""} ${talent.skill_category} ${talent.experience || ""}`).includes(search) ||
      (phoneSearch && `${talent.mobile} ${talent.whatsapp || ""}`.replace(/\D/g, "").includes(phone))),
  );
}

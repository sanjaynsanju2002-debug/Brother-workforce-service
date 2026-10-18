import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { jobText, salaryText } from "@/lib/jobContent";
import type { CandidateLanguage } from "@/lib/candidateLanguage";
import type { Job } from "@/types";

export function JobShare({ job, language }: { job: Job; language: CandidateLanguage }) {
  const url = `https://brothersworkforcesolutions.in/jobs/${encodeURIComponent(job.id)}`;
  const text = `${jobText(job.title, language, job.title_kn)} — ${jobText(job.location, language, job.location_kn)}\n${url}`;
  return <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50" aria-label={language === "kn" ? "ಈ ಉದ್ಯೋಗವನ್ನು ವಾಟ್ಸಾಪ್‌ನಲ್ಲಿ ಹಂಚಿಕೊಳ್ಳಿ" : `Share ${job.title} on WhatsApp`}>{language === "kn" ? "ವಾಟ್ಸಾಪ್‌ನಲ್ಲಿ ಹಂಚಿಕೊಳ್ಳಿ" : "Share on WhatsApp"}</a>;
}

export default function JobListings({ jobs, language }: { jobs: Job[]; language: CandidateLanguage }) {
  const kn = language === "kn";
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [qualification, setQualification] = useState("");
  const [shift, setShift] = useState("");
  const options = (key: "location" | "qualification" | "shift") => [...new Set(jobs.map((j) => j[key]?.trim()).filter((v): v is string => !!v))].sort();
  const filtered = jobs.filter((j) => (!location || j.location === location) && (!qualification || j.qualification === qualification) && (!shift || j.shift === shift) && `${j.title} ${j.title_kn || ""} ${j.location} ${j.location_kn || ""} ${j.skill_category} ${j.qualification || ""} ${j.description || ""} ${j.description_kn || ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <div lang={language}>
    <div className="my-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4" role="search" aria-label={kn ? "ಉದ್ಯೋಗ ಹುಡುಕಿ" : "Find jobs"}>
      <div><label htmlFor="job-search" className="mb-1 block text-sm font-medium">{kn ? "ಉದ್ಯೋಗ ಹುಡುಕಿ" : "Search jobs"}</label><Input id="job-search" placeholder={kn ? "ಹುದ್ದೆ ಅಥವಾ ಸ್ಥಳ" : "Role, skill or location"} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      {([['location', location, setLocation, kn ? 'ಸ್ಥಳ' : 'Location'], ['qualification', qualification, setQualification, kn ? 'ವಿದ್ಯಾರ್ಹತೆ' : 'Qualification'], ['shift', shift, setShift, kn ? 'ಪಾಳಿ' : 'Shift']] as const).map(([key, value, setter, label]) => <div key={key}><label htmlFor={`job-filter-${key}`} className="mb-1 block text-sm font-medium">{label}</label><select id={`job-filter-${key}`} className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" value={value} onChange={(e) => setter(e.target.value)}><option value="">{kn ? "ಎಲ್ಲಾ ಆಯ್ಕೆಗಳು" : "All options"}</option>{options(key).map((v) => <option key={v} value={v}>{jobText(v, language)}</option>)}</select></div>)}
    </div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600" role="status">{kn ? `${jobs.length} ಉದ್ಯೋಗ ಪ್ರಕಾರಗಳು · ${jobs.reduce((n, j) => n + j.openings, 0)} ಖಾಲಿ ಹುದ್ದೆಗಳು · ${filtered.length} ಫಲಿತಾಂಶಗಳು` : `${jobs.length} job roles · ${jobs.reduce((n, j) => n + j.openings, 0)} vacancies · ${filtered.length} results`}</p>{(search || location || qualification || shift) && <Button type="button" variant="outline" onClick={() => { setSearch(""); setLocation(""); setQualification(""); setShift(""); }}>{kn ? "ಫಿಲ್ಟರ್ ತೆರವುಗೊಳಿಸಿ" : "Clear filters"}</Button>}</div>
    {!filtered.length && <p className="rounded-xl border border-dashed bg-white p-8 text-center text-slate-600">{kn ? "ಈ ಆಯ್ಕೆಗಳಿಗೆ ಉದ್ಯೋಗಗಳು ಸಿಗಲಿಲ್ಲ. ಫಿಲ್ಟರ್‌ಗಳನ್ನು ಬದಲಾಯಿಸಿ ಅಥವಾ ಮುಂದಿನ ಉದ್ಯೋಗಗಳಿಗಾಗಿ ನೋಂದಾಯಿಸಿ." : "No jobs match these filters. Try another search or register for future opportunities below."}</p>}
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{filtered.map((j) => <article key={j.id} className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm" data-testid={`job-card-${j.id}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[#C2410C]">{jobText(j.skill_category, language)}</p>
      <h3 className="mt-2 text-xl font-semibold text-[#0F2444]">{jobText(j.title, language, j.title_kn)}</h3>
      <p className="mt-1 text-sm text-slate-500">{jobText(j.location, language, j.location_kn)}</p>
      <dl className="my-4 space-y-2 text-sm"><div><dt className="font-medium">{kn ? "ಸಂಬಳ" : "Salary"}</dt><dd className="text-slate-600">{salaryText(j, language)}</dd></div>
        {j.experience && <div><dt className="font-medium">{kn ? "ಅನುಭವ" : "Experience"}</dt><dd className="text-slate-600">{jobText(j.experience, language, j.experience_kn)}</dd></div>}
        {j.shift && <div><dt className="font-medium">{kn ? "ಪಾಳಿ" : "Shift"}</dt><dd className="text-slate-600">{jobText(j.shift, language, j.shift_kn)}</dd></div>}
        <div><dt className="font-medium">{kn ? "ಖಾಲಿ ಹುದ್ದೆಗಳು" : "Vacancies"}</dt><dd>{j.openings}</dd></div>
        {j.qualification && <div><dt className="font-medium">{kn ? "ವಿದ್ಯಾರ್ಹತೆ" : "Qualification"}</dt><dd className="text-slate-600">{jobText(j.qualification, language, j.qualification_kn)}</dd></div>}
        <div><dt className="font-medium">{kn ? "ಪ್ರಕಟಿಸಿದ ದಿನಾಂಕ" : "Posted"}</dt><dd className="text-slate-600">{new Date(j.created_at).toLocaleDateString(kn ? "kn-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric" })}</dd></div>
        {j.closing_date && <div><dt className="font-medium">{kn ? "ಕೊನೆಯ ದಿನ" : "Apply by"}</dt><dd className="text-slate-600">{new Date(`${j.closing_date}T12:00:00`).toLocaleDateString(kn ? "kn-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric" })}</dd></div>}
      </dl>
      {(j.description || j.description_kn) && <p className="mb-5 line-clamp-3 whitespace-pre-line text-sm text-slate-600">{jobText(j.description, language, j.description_kn)}</p>}
      <div className="mt-auto grid gap-2"><Link to={`/jobs/${j.id}`} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#C2410C] px-4 py-3 text-center font-semibold text-white hover:bg-[#9A3412]" data-testid={`job-apply-${j.id}`}>{kn ? "ವಿವರ ನೋಡಿ ಅರ್ಜಿ ಸಲ್ಲಿಸಿ" : "View & Apply"}</Link><JobShare job={j} language={language} /></div>
    </article>)}</div>
  </div>;
}

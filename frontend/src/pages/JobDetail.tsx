import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, CalendarDays, MapPin } from "lucide-react";
import Footer from "@/components/site/Footer";
import CandidateLanguageToggle from "@/components/site/CandidateLanguageToggle";
import WorkerForm from "@/components/site/WorkerForm";
import { apiGet } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { candidateCopy, useCandidateLanguage } from "@/lib/candidateLanguage";
import type { Job } from "@/types";

export default function JobDetail() {
  const [language, setLanguage] = useCandidateLanguage();
  const copy = candidateCopy[language];
  const { jobId } = useParams();
  const job = useQuery({
    queryKey: ["job-detail", jobId],
    queryFn: () => apiGet<Job>(`/jobs/${encodeURIComponent(jobId ?? "")}`),
    enabled: !!jobId,
    retry: false,
  });

  useEffect(() => {
    const previous = document.title;
    document.title = job.data ? `${job.data.title} in ${job.data.location} | ${BRAND.name}` : `Job Opening | ${BRAND.name}`;
    return () => { document.title = previous; };
  }, [job.data]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F2444]">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <Link to="/" className="flex items-center gap-3 font-semibold"><img src={BRAND.logo} alt="" className="h-10 w-10 object-contain" />{BRAND.name}</Link>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <CandidateLanguageToggle language={language} onChange={setLanguage} />
            <Link to="/#jobs" className="text-sm font-semibold text-[#EA580C]">{copy.allOpenings}</Link>
          </div>
        </div>
      </header>
      <main lang={language} className="mx-auto max-w-6xl px-5 py-10">
        {job.isPending && <p className="rounded-xl bg-white p-8">{copy.loading}</p>}
        {job.isError && (
          <div className="rounded-xl border bg-white p-8">
            <h1 className="text-2xl font-bold">This opening is no longer available</h1>
            <p className="mt-3 text-slate-600">You can see current openings or register your profile for future opportunities.</p>
            <Link to="/#jobs" className="mt-5 inline-block font-semibold text-[#EA580C] underline">View current jobs</Link>
          </div>
        )}
        {job.data && (
          <>
            <div className="rounded-2xl bg-[#0F2444] p-7 text-white sm:p-10">
              <p className="text-xs font-bold uppercase tracking-widest text-orange-300">{copy.currentOpening} · {job.data.skill_category}</p>
              <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{job.data.title}</h1>
              <p className="mt-3 flex items-center gap-2 text-slate-200"><MapPin className="h-4 w-4" />{job.data.location}</p>
              <a href="#apply" className="mt-6 inline-flex rounded-md bg-[#EA580C] px-6 py-3 font-semibold text-white hover:bg-[#C2410C]">{copy.applyForJob}</a>
            </div>
            <div className="mt-7 grid gap-7 lg:grid-cols-[1fr_1.25fr]">
              <section className="self-start rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
                <h2 className="flex items-center gap-2 text-xl font-semibold"><Briefcase className="h-5 w-5 text-[#EA580C]" />{copy.jobDetails}</h2>
                <dl className="mt-5 space-y-4 text-sm">
                  <Detail label={copy.salary} value={job.data.salary || copy.discuss} />
                  <Detail label={copy.experience} value={job.data.experience || copy.discuss} />
                  <Detail label={copy.shift} value={job.data.shift || copy.discuss} />
                  <Detail label={copy.openings} value={String(job.data.openings)} />
                  <Detail label={copy.employer} value={job.data.employer_name || copy.confidentialEmployer} />
                  <Detail label={copy.posted} value={new Date(job.data.created_at).toLocaleDateString(language === "kn" ? "kn-IN" : "en-IN", { day: "numeric", month: "long", year: "numeric" })} />
                  {job.data.closing_date && <Detail label={copy.closingDate} value={new Date(`${job.data.closing_date}T12:00:00`).toLocaleDateString(language === "kn" ? "kn-IN" : "en-IN", { day: "numeric", month: "long", year: "numeric" })} />}
                </dl>
                {language === "kn" && job.data.description && !job.data.description_kn && <p className="mt-5 text-sm text-slate-600">{copy.descriptionEnglish}</p>}
                {(language === "kn" ? job.data.description_kn || job.data.description : job.data.description) && <p className="mt-6 whitespace-pre-line border-t pt-5 text-sm leading-relaxed text-slate-700">{language === "kn" ? job.data.description_kn || job.data.description : job.data.description}</p>}
                {!job.data.description && <p className="mt-6 border-t pt-5 text-sm text-slate-700">{copy.missingDescription} <a className="font-semibold text-[#EA580C] underline" href={BRAND.whatsapp}>WhatsApp</a></p>}
                <p className="mt-6 flex items-center gap-2 text-xs text-slate-500"><CalendarDays className="h-4 w-4" />{copy.reviewed}</p>
              </section>
              <section id="apply" className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
                <h2 className="text-xl font-semibold">{copy.applyFor} {job.data.title}</h2>
                <p className="mt-2 mb-6 text-sm text-slate-600">{copy.linkedApplication}</p>
                <WorkerForm job={job.data} language={language} />
              </section>
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-5 border-b pb-3"><dt className="text-slate-500">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>;
}

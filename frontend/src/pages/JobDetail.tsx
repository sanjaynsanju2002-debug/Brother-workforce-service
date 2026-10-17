import { translateText, useSiteLanguage } from "@/lib/language";
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, CalendarDays, MapPin } from "lucide-react";
import Footer from "@/components/site/Footer";
import WorkerForm from "@/components/site/WorkerForm";
import { ApiError, apiGet } from "@/lib/api";
import { trackVisit } from "@/lib/track";
import { BRAND } from "@/lib/brand";
import { candidateCopy, useCandidateLanguage } from "@/lib/candidateLanguage";
import type { Job } from "@/types";
import LanguageSelector from "@/components/site/LanguageSelector";

export default function JobDetail() {
  useSiteLanguage();
  const [language] = useCandidateLanguage();
  const copy = candidateCopy[language];
  const { jobId } = useParams();
  useEffect(() => { trackVisit(window.location.pathname); }, []);
  const job = useQuery({
    queryKey: ["job-detail", jobId],
    queryFn: () => apiGet<Job>(`/jobs/${encodeURIComponent(jobId ?? "")}`),
    enabled: !!jobId,
    retry: false,
  });

  useEffect(() => {
    const previous = document.title;
    const title = job.data ? `${job.data.title} in ${job.data.location} | ${BRAND.name}` : `Job Opening | ${BRAND.name}`;
    const description = job.data
      ? (translateText((language === "kn" ? job.data.description_kn || job.data.description : job.data.description) || `${job.data.title} opening in ${job.data.location}. See role details and apply directly with ${BRAND.name}.`).replace(/\s+/g, " ").trim().slice(0, 160))
      : "";
    const url = job.data ? `${window.location.origin}/jobs/${encodeURIComponent(job.data.id)}` : "";
    const changed: Array<{ element: Element; attribute: string; previous: string | null }> = [];
    const update = (selector: string, attribute: string, value: string) => {
      const element = document.querySelector(selector);
      if (!element || !value) return;
      changed.push({ element, attribute, previous: element.getAttribute(attribute) });
      element.setAttribute(attribute, value);
    };
    document.title = translateText(title);
    update('link[rel="canonical"]', "href", url);
    update('meta[property="og:url"]', "content", url);
    update('meta[name="description"]', "content", description);
    update('meta[property="og:description"]', "content", description);
    update('meta[name="twitter:description"]', "content", description);
    update('meta[property="og:title"]', "content", translateText(title));
    update('meta[name="twitter:title"]', "content", translateText(title));
    return () => {
      document.title = previous;
      changed.forEach(({ element, attribute, previous: value }) => {
        if (value === null) element.removeAttribute(attribute);
        else element.setAttribute(attribute, value);
      });
    };
  }, [job.data, language]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F2444]">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <Link to="/" className="flex items-center gap-3 font-semibold"><img src={BRAND.logo} alt="" className="h-10 w-10 object-contain" />{translateText(BRAND.name)}</Link>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <LanguageSelector />
            <Link to="/#jobs" className="text-sm font-semibold text-[#C2410C]">{translateText(copy.allOpenings)}</Link>
          </div>
        </div>
      </header>
      <main lang={language} className="mx-auto max-w-6xl px-5 py-10">
        {job.isPending && <p className="rounded-xl bg-white p-8">{translateText(copy.loading)}</p>}
        {job.isError && (
          <div role="alert" className="rounded-xl border bg-white p-8">
            <h1 className="text-2xl font-bold">{translateText(job.error instanceof ApiError && job.error.status === 404 ? "This opening is no longer available" : "Could not load this opening")}</h1>
            <p className="mt-3 text-slate-600">{translateText(job.error instanceof ApiError && job.error.status === 404 ? "You can see current openings or register your profile for future opportunities." : "Please try again. Our recruitment team can also help by phone or WhatsApp.")}</p>
            {!(job.error instanceof ApiError && job.error.status === 404) && <button type="button" className="mr-5 mt-5 font-semibold text-[#C2410C] underline" onClick={() => job.refetch()}>{translateText("Try again")}</button>}
            <Link to="/#jobs" className="mt-5 inline-block font-semibold text-[#C2410C] underline">{translateText("View current jobs")}</Link>
          </div>
        )}
        {job.data && (
          <>
            <div className="rounded-2xl bg-[#0F2444] p-7 text-white sm:p-10">
              <p className="text-xs font-bold uppercase tracking-widest text-orange-300">{translateText(copy.currentOpening)} · {translateText(job.data.skill_category)}</p>
              <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{translateText(job.data.title)}</h1>
              <p className="mt-3 flex items-center gap-2 text-slate-200"><MapPin className="h-4 w-4" />{translateText(job.data.location)}</p>
              <a href="#apply" className="mt-6 inline-flex rounded-md bg-[#C2410C] px-6 py-3 font-semibold text-white hover:bg-[#9A3412]">{translateText(copy.applyForJob)}</a>
            </div>
            <div className="mt-7 grid gap-7 lg:grid-cols-[1fr_1.25fr]">
              <section className="self-start rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
                <h2 className="flex items-center gap-2 text-xl font-semibold"><Briefcase className="h-5 w-5 text-[#C2410C]" />{translateText(copy.jobDetails)}</h2>
                <dl className="mt-5 space-y-4 text-sm">
                  <Detail label={translateText(copy.salary)} value={job.data.salary || copy.discuss} />
                  <Detail label={translateText(copy.experience)} value={job.data.experience || copy.discuss} />
                  <Detail label={translateText(copy.shift)} value={job.data.shift || copy.discuss} />
                  <Detail label={translateText(copy.openings)} value={String(job.data.openings)} />
                  <Detail label={translateText(copy.employer)} value={job.data.employer_name || copy.confidentialEmployer} />
                  <Detail label={translateText(copy.posted)} value={new Date(job.data.created_at).toLocaleDateString(language === "kn" ? "kn-IN" : "en-IN", { day: "numeric", month: "long", year: "numeric" })} />
                  {job.data.closing_date && <Detail label={translateText(copy.closingDate)} value={new Date(`${job.data.closing_date}T12:00:00`).toLocaleDateString(language === "kn" ? "kn-IN" : "en-IN", { day: "numeric", month: "long", year: "numeric" })} />}
                </dl>
                {language === "kn" && job.data.description && !job.data.description_kn && translateText(job.data.description) === job.data.description && <p className="mt-5 text-sm text-slate-600">{translateText(copy.descriptionEnglish)}</p>}
                {(language === "kn" ? job.data.description_kn || job.data.description : job.data.description) && <p className="mt-6 whitespace-pre-line border-t pt-5 text-sm leading-relaxed text-slate-700">{translateText(language === "kn" ? job.data.description_kn || job.data.description : job.data.description)}</p>}
                {!job.data.description && <p className="mt-6 border-t pt-5 text-sm text-slate-700">{translateText(copy.missingDescription)} <a className="font-semibold text-[#C2410C] underline" href={BRAND.whatsapp}>{translateText("WhatsApp")}</a></p>}
                <p className="mt-6 flex items-center gap-2 text-xs text-slate-500"><CalendarDays className="h-4 w-4" />{translateText(copy.reviewed)}</p>
              </section>
              <section id="apply" className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
                <h2 className="text-xl font-semibold">{translateText(copy.applyFor)} {translateText(job.data.title)}</h2>
                <p className="mt-2 mb-6 text-sm text-slate-600">{translateText(copy.linkedApplication)}</p>
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
  useSiteLanguage();
  return <div className="flex justify-between gap-5 border-b pb-3"><dt className="text-slate-500">{translateText(label)}</dt><dd className="text-right font-semibold">{translateText(value)}</dd></div>;
}

import RecruitmentFAQ from "@/components/site/RecruitmentFAQ";
import JobListings from "@/components/site/JobListings";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Award,
  Box,
  Briefcase,
  Building2,
  Car,
  Cpu,
  Factory,
  FileBadge,
  MapPin,
  Mail,
  MessageSquare,
  PackageCheck,
  PhoneCall,
  PiggyBank,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Users,
  Utensils,
  Wrench,
} from "lucide-react";
import Navbar from "@/components/site/Navbar";
import Footer from "@/components/site/Footer";
import BusinessChat from "@/components/site/BusinessChat";
import CandidateLanguageToggle from "@/components/site/CandidateLanguageToggle";
import WorkerForm from "@/components/site/WorkerForm";
import CompanyForm from "@/components/site/CompanyForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiGet } from "@/lib/api";
import { BRAND, IMAGES } from "@/lib/brand";
import { candidateCopy, useCandidateLanguage } from "@/lib/candidateLanguage";
import { trackVisit } from "@/lib/track";
import type { Client, Job } from "@/types";

const TRUST = [
  { icon: FileBadge, title: "Licensed Labour Contractor", desc: "Contract labour staffing services" },
  { icon: ReceiptText, title: "GST Registered", desc: "Official tax invoicing & compliance" },
  { icon: ShieldCheck, title: "ESIC Covered Employees", desc: "Employee welfare compliance" },
  { icon: PiggyBank, title: "EPF Services", desc: "Provident fund enrolment & remittance" },
  { icon: Award, title: "MSME Registered", desc: "Registered under MSME framework" },
];

const SERVICES = [
  {
    title: "Skilled Workforce",
    tag: "Technical & Precision",
    items: ["Machine Operators", "Technicians", "Electricians", "Welders", "Fitters", "Experienced industrial workers"],
    icon: Wrench,
  },
  {
    title: "Semi-Skilled Workforce",
    tag: "Operational Execution",
    items: ["Production operators", "Assembly workers", "Quality support workers", "Warehouse associates", "Packaging operators"],
    icon: PackageCheck,
  },
  {
    title: "General Workforce",
    tag: "Plant & Material Operations",
    items: ["Helpers", "Packers", "Loaders", "Material handling workers", "Production assistants"],
    icon: Users,
  },
  {
    title: "Factory Workforce Solutions",
    tag: "Turnkey Line Staffing",
    items: ["Manufacturing units", "Production lines", "Industrial operations"],
    icon: Factory,
  },
  {
    title: "Warehouse & Logistics Workforce",
    tag: "Supply Chain & Fulfilment",
    items: ["Picking", "Packing", "Sorting", "Loading", "Dispatch operations"],
    icon: Truck,
  },
];

const INDUSTRY_CARDS = [
  { name: "Manufacturing", icon: Factory },
  { name: "Automobile", icon: Car },
  { name: "Engineering", icon: Wrench },
  { name: "Electronics", icon: Cpu },
  { name: "Warehouse & Logistics", icon: Truck },
  { name: "FMCG", icon: ShoppingBag },
  { name: "Food Processing", icon: Utensils },
  { name: "Packaging", icon: Box },
  { name: "Industrial Operations", icon: Activity },
];

const COMPLIANCE = [
  { title: "Licensed Labour Contractor", desc: "Contact our team for contract labour licence details.", icon: FileBadge },
  { title: "Karnataka Registered Establishment", desc: `Shops and Commercial Establishments Reg. No: ${BRAND.establishmentRegistrationNumber}. Valid through ${BRAND.establishmentRegistrationValidThrough}.`, icon: FileBadge },
  { title: "GST Registered", desc: `GST No: ${BRAND.gst}`, icon: ReceiptText },
  { title: "ESIC Employee Coverage", desc: "Employee welfare supported through ESIC compliance.", icon: ShieldCheck },
  { title: "EPF Services", desc: "Employee provident fund enrolment and monthly remittance handled for deployed workforce.", icon: PiggyBank },
  { title: "MSME Registered", desc: "Registered business under the MSME framework.", icon: Award },
];

function scrollTo(id: string) {
  document.querySelector(id)?.scrollIntoView({ behavior: "smooth" });
}

export default function Home() {
  const [candidateLang, setCandidateLang] = useCandidateLanguage();
  const copy = candidateCopy[candidateLang];
  useEffect(() => {
    document.title = "Brothers Workforce Solutions | Manpower Services in Mysuru, Karnataka";
    trackVisit("/");
    const anchor = window.location.hash.slice(1);
    if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: "instant" });

    const revealItems = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!("IntersectionObserver" in window)) {
      revealItems.forEach((item) => item.setAttribute("data-visible", "true"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).setAttribute("data-visible", "true");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );

    revealItems.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  const jobsQuery = useQuery({ queryKey: ["jobs"], queryFn: () => apiGet<Job[]>("/jobs") });
  const jobs = jobsQuery.isError ? [] : (jobsQuery.data ?? []);

  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: () => apiGet<Client[]>("/clients") });
  const clients = clientsQuery.isError ? [] : (clientsQuery.data ?? []);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar />

      {/* HERO */}
      <section id="home" className="bws-hero-3d relative overflow-hidden bg-[#0F2444]">
        <img
          src={IMAGES.hero}
          alt=""
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover opacity-34"
        />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(15,36,68,0.97)_0%,rgba(15,36,68,0.88)_52%,rgba(15,36,68,0.65)_100%)]" />
        <div className="bws-industrial-grid absolute inset-0 opacity-25" aria-hidden="true" />
        <div className="bws-hero-orb bws-hero-orb-one" aria-hidden="true" />
        <div className="bws-hero-orb bws-hero-orb-two" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-6 py-20 lg:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-[1.08fr_.92fr]">
          <div className="max-w-3xl bws-rise">
            <p className="bws-overline text-orange-400">Manpower Supply Partner · Mysuru (Mysore), Karnataka</p>
            <h1 className="mt-4 text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Reliable Manpower Services.
              <br />
              <span className="text-[#FB923C]">Stronger Businesses.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-200 sm:text-lg">
              Brothers Workforce Solutions provides dependable skilled, semi-skilled and general manpower supply,
              contract staffing and workforce solutions for factories, warehouses and industrial operations across Karnataka.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                onClick={() => scrollTo("#manpower-request")}
                className="bws-btn-3d bg-[#C2410C] px-7 py-6 text-base font-semibold text-white hover:bg-[#9A3412]"
                data-testid="hero-btn-request-manpower"
              >
                Request Manpower
              </Button>
              <Button
                onClick={() => scrollTo("#jobs")}
                variant="outline"
                className="bws-btn-glass border-white/40 bg-white/10 px-7 py-6 text-base font-semibold text-white backdrop-blur hover:bg-white hover:text-[#0F2444]"
                data-testid="hero-btn-apply-jobs"
              >
                Apply for Jobs
              </Button>
            </div>
          </div>

          <div className="bws-hero-visual mx-auto w-full max-w-[470px] lg:mx-0" data-reveal>
            <div className="bws-image-shell bws-image-shell-dark">
              <img
                src={IMAGES.heroTeam}
                alt="Industrial workforce in a factory, representing our staffing services"
                loading="eager"
                decoding="async"
                className="aspect-[4/5] w-full object-cover"
              />
            </div>
          </div>
          </div>

          <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="hero-trust-badges">
            {TRUST.map((t) => (
              <div
                key={t.title}
                className="bws-glass-card rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-md hover:border-orange-400/60"
              >
                <t.icon className="mb-2 h-5 w-5 text-[#FB923C]" />
                <p className="text-sm font-semibold text-white">{t.title}</p>
                <p className="mt-0.5 text-xs text-slate-300">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BROCHURE-INSPIRED WORKFORCE FEATURE */}
      <section className="bws-brochure-band bg-white py-14">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-6 lg:grid-cols-[0.72fr_1.28fr]">
          <div className="bws-brochure-photo-wrap mx-auto w-full max-w-sm" data-reveal>
            <div className="bws-brochure-photo">
              <img
                src="/brochure-team-oct2026.webp"
                alt="Uniformed workers in a modern industrial processing facility"
                loading="lazy"
                decoding="async"
                onError={(event) => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.src = "/factory-team.webp";
                }}
                className="h-[430px] w-full object-cover"
              />
            </div>
            <div className="bws-brochure-ribbon">Skilled People · Better Tomorrow</div>
          </div>

          <div data-reveal>
            <p className="bws-overline">Workforce services</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0F2444] lg:text-5xl">
              People. Productivity. Partnership. <span className="text-[#C2410C]">Progress.</span>
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
              Reliable workforce support designed around people, process and performance — helping factories,
              warehouses and industrial teams build stronger operations.
            </p>
            <a href="/api/company-brochure.pdf" className="mt-5 inline-flex min-h-11 items-center rounded-lg border border-[#C2410C] px-5 py-3 font-semibold text-[#C2410C] hover:bg-orange-50">Download company brochure (PDF)</a>
            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {[
                ["Reliable", "Dependable workforce support"],
                ["Compliant", "Structured staffing processes"],
                ["People Focused", "Long-term workforce relationships"],
              ].map(([title, desc]) => (
                <div key={title} className="bws-mini-stat">
                  <p className="font-semibold text-[#0F2444]">{title}</p>
                  <p className="mt-1 text-xs text-slate-500">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <Section id="about" bg="bg-white">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div data-reveal>
            <p className="bws-overline">About Us</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0F2444] lg:text-4xl">
              Manpower & Workforce Partner in Mysuru, Karnataka
            </h2>
            <div className="mt-6 space-y-4 text-base leading-relaxed text-slate-600">
              <p>
                Brothers Workforce Solutions is a manpower and contract staffing partner providing skilled, semi-skilled
                and general workforce solutions to factories, warehouses, manufacturing units and businesses across Karnataka.
              </p>
              <p>
                We focus on connecting businesses with reliable employees while supporting workforce availability,
                compliance and operational continuity.
              </p>
              <p className="border-l-4 border-[#EA580C] pl-4 font-medium text-[#0F2444]">
                Our objective is to create long-term partnerships between businesses and employees.
              </p>
            </div>
          </div>
          <div className="bws-about-visual relative" data-reveal>
            <div className="bws-image-shell">
              <img
                src={IMAGES.safety}
                alt="Factory worker in uniform working on a production floor"
                loading="lazy"
                decoding="async"
                className="h-[380px] w-full object-cover"
              />
            </div>
            <div className="bws-floating-tag absolute -bottom-6 left-6 hidden rounded-xl bg-[#0F2444] px-6 py-4 text-white shadow-2xl sm:block">
              <p className="font-[family-name:var(--font-heading)] text-sm font-bold uppercase tracking-[0.18em] text-[#FB923C]">
                {BRAND.tagline}
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* SERVICES */}
      <Section id="services" bg="bg-[#F1F5F9]">
        <Heading overline="Our Services" title="Manpower & Contract Staffing Services" subtitle="Skilled, semi-skilled and general workforce staffing for factories, manufacturing units, warehouses and logistics operations." />
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s) => (
            <Card
              key={s.title}
              className="bws-card-3d border-slate-200 bg-white hover:border-[#EA580C]/45"
              data-reveal
              data-testid={`service-card-${s.title.toLowerCase().replace(/[^a-z]+/g, "-")}`}
            >
              <CardContent className="p-6">
                <div className="mb-4 inline-flex rounded-md bg-[#0F2444] p-3">
                  <s.icon className="h-5 w-5 text-[#FB923C]" />
                </div>
                <Badge variant="secondary" className="mb-2 text-[10px] uppercase tracking-widest">
                  {s.tag}
                </Badge>
                <h3 className="text-xl font-semibold text-[#0F2444]">{s.title}</h3>
                <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
                  {s.items.map((i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C2410C]" />
                      {i}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      {/* INDUSTRIES */}
      <Section id="industries" bg="bg-white">
        <Heading overline="Sectors" title="Industries We Serve" subtitle="Supporting production units and supply chains across Mysore and Karnataka industrial belts." />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {INDUSTRY_CARDS.map((i) => (
            <div
              key={i.name}
              className="bws-industry-card flex items-center gap-4 rounded-xl border border-slate-200 bg-[#F8FAFC] p-5 hover:border-[#EA580C]/45 hover:bg-white"
              data-reveal
              data-testid={`industry-card-${i.name.toLowerCase().replace(/[^a-z]+/g, "-")}`}
            >
              <i.icon className="h-6 w-6 shrink-0 text-[#C2410C]" />
              <span className="font-medium text-[#0F2444]">{i.name}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* COMPLIANCE */}
      <Section id="compliance" bg="bg-[#0F2444]">
        <div className="text-center">
          <p className="bws-overline text-[#FB923C]">Trust & Governance</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white lg:text-4xl">
            Our Compliance Commitment
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-300">
            Statutory compliance and documented workforce governance so companies can engage manpower with
            confidence.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {COMPLIANCE.map((c) => (
            <div
              key={c.title}
              className="bws-glass-card rounded-xl border border-white/15 bg-white/5 p-6 hover:border-[#FB923C]/60"
              data-reveal
              data-testid={`compliance-card-${c.title.toLowerCase().replace(/[^a-z]+/g, "-")}`}
            >
              <c.icon className="mb-4 h-7 w-7 text-[#FB923C]" />
              <h3 className="text-lg font-semibold text-white">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{c.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* JOBS */}
      <Section id="jobs" bg="bg-[#F1F5F9]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <Heading overline={copy.recruitment} title={copy.jobs} subtitle={copy.jobsIntro} />
          <CandidateLanguageToggle language={candidateLang} onChange={setCandidateLang} />
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur" data-reveal>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[#0F2444] p-2.5 text-white shadow-lg">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#0F2444]">
                {jobs.length > 0 ? candidateLang === "kn" ? `${jobs.length} ಉದ್ಯೋಗ ಪ್ರಕಾರಗಳು · ${jobs.reduce((n, j) => n + j.openings, 0)} ಖಾಲಿ ಹುದ್ದೆಗಳು` : `${jobs.length} job roles · ${jobs.reduce((n, j) => n + j.openings, 0)} vacancies` : copy.registerFuture}
              </p>
              <p className="text-xs text-slate-500">{candidateLang === "kn" ? "ಒಮ್ಮೆ ನೋಂದಾಯಿಸಿ. ನಮ್ಮ ನೇಮಕಾತಿ ತಂಡ ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಪರಿಶೀಲಿಸುತ್ತದೆ." : "Apply once and stay visible to our recruitment team."}</p>
            </div>
          </div>
          <Button
            className="bws-btn-3d bg-[#C2410C] text-white hover:bg-[#9A3412]"
            onClick={() => scrollTo("#worker-registration")}
          >
            {copy.quickApply}
          </Button>
        </div>
        <div className="mt-6" data-testid="job-listings">
          {jobsQuery.isPending ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center text-slate-600" role="status">
              {copy.loading}
            </div>
          ) : jobsQuery.isError ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center">
              <p className="text-lg font-semibold text-[#0F2444]">{copy.loadError}</p>
              <Button variant="outline" className="mt-5" onClick={() => jobsQuery.refetch()}>{copy.retry}</Button>
            </div>
          ) : jobs.length === 0 ? (
            <div
              className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center"
              data-testid="jobs-empty-state"
            >
              <Briefcase className="mx-auto mb-4 h-10 w-10 text-slate-400" />
              <p className="text-lg font-semibold text-[#0F2444]">
                {copy.noJobs}
              </p>
              <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
                {copy.noJobsHelp}
              </p>
              <Button
                className="mt-6 bg-[#C2410C] text-white hover:bg-[#9A3412]"
                onClick={() => scrollTo("#worker-registration")}
                data-testid="jobs-empty-cta"
              >
                {copy.registerFuture}
              </Button>
            </div>
          ) : (
            <JobListings jobs={jobs} language={candidateLang} />
          )}
        </div>
      </Section>

      {/* HOW IT WORKS */}
      <Section id="how-it-works" bg="bg-[#0B1B33]">
        <div className="text-center" data-reveal>
          <p className="bws-overline text-[#FB923C]">{candidateLang === "kn" ? "ಇದು ಹೇಗೆ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತದೆ" : "How It Works"}</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white lg:text-5xl">
            {candidateLang === "kn" ? "ಅಭ್ಯರ್ಥಿಗಳಿಗೆ ಸರಳ ಪ್ರಕ್ರಿಯೆ. ಕಂಪನಿಗಳಿಗೆ ವ್ಯವಸ್ಥಿತ ಸೇವೆ." : "Simple for Workers. Structured for Companies."}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-300">
            {candidateLang === "kn" ? "ಉದ್ಯೋಗಾರ್ಥಿಗಳಿಗೆ ಸ್ಪಷ್ಟ ಪ್ರಕ್ರಿಯೆ ಮತ್ತು ಉದ್ಯೋಗದಾತರಿಗೆ ವಿಶ್ವಾಸಾರ್ಹ ಮಾನವ ಸಂಪನ್ಮೂಲ ಸೇವೆ." : "One clear process for job seekers and one reliable process for employers looking for manpower."}
          </p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          <div className="bws-flow-panel" data-reveal>
            <div className="bws-flow-heading">
              <Users className="h-6 w-6" />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-300">{candidateLang === "kn" ? "ಉದ್ಯೋಗಾರ್ಥಿಗಳಿಗಾಗಿ" : "For Job Seekers"}</p>
                <h3 className="mt-1 text-2xl font-semibold text-white">{candidateLang === "kn" ? "ನೋಂದಣಿಯಿಂದ ಉದ್ಯೋಗಾವಕಾಶದವರೆಗೆ" : "From profile to opportunity"}</h3>
              </div>
            </div>
            <div className="mt-7 space-y-4">
              {(candidateLang === "kn" ? [
                ["01", "ನಿಮ್ಮ ವಿವರಗಳನ್ನು ನೀಡಿ", "ವಿದ್ಯಾರ್ಹತೆ, ಕೌಶಲ್ಯ, ಅನುಭವ ಮತ್ತು ಆದ್ಯತೆಯ ಸ್ಥಳವನ್ನು ನಮೂದಿಸಿ."],
                ["02", "ಸ್ವವಿವರ ಪತ್ರ ಸೇರಿಸಿ (ಐಚ್ಛಿಕ)", "ನಮ್ಮ ತಂಡ ಪರಿಶೀಲಿಸಲು ನಿಮ್ಮ ಸ್ವವಿವರ ಪತ್ರವನ್ನು ಸೇರಿಸಬಹುದು."],
                ["03", "ಸೂಕ್ತ ಅವಕಾಶ ಪಡೆಯಿರಿ", "ನಿಮ್ಮ ವಿವರಗಳಿಗೆ ಹೊಂದುವ ಉದ್ಯೋಗಾವಕಾಶಗಳನ್ನು ನಮ್ಮ ತಂಡ ಪರಿಶೀಲಿಸುತ್ತದೆ."],
              ] : [
                ["01", "Create your profile", "Share your education, skills, experience and preferred location."],
                ["02", "Add your resume (optional)", "You can add a resume to help our recruitment team review your profile."],
                ["03", "Get matched", "We connect suitable candidates with current and upcoming workforce requirements."],
              ]).map(([step, title, desc]) => (
                <div key={step} className="bws-flow-step">
                  <span>{step}</span>
                  <div>
                    <h4>{title}</h4>
                    <p>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button
              onClick={() => scrollTo("#worker-registration")}
              className="bws-btn-3d mt-7 bg-[#C2410C] text-white hover:bg-[#9A3412]"
            >
              {copy.registerFuture}
            </Button>
          </div>

          <div className="bws-flow-panel bws-flow-panel-orange" data-reveal>
            <div className="bws-flow-heading">
              <Factory className="h-6 w-6" />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-300">For Employers</p>
                <h3 className="mt-1 text-2xl font-semibold text-white">From requirement to deployment</h3>
              </div>
            </div>
            <div className="mt-7 space-y-4">
              {[
                ["01", "Share your requirement", "Tell us the role, workforce type, quantity, shift and work location."],
                ["02", "Screening & coordination", "Our team reviews matching profiles and coordinates candidate readiness."],
                ["03", "Workforce deployment", "Selected candidates are coordinated for joining based on your requirement."],
              ].map(([step, title, desc]) => (
                <div key={step} className="bws-flow-step">
                  <span>{step}</span>
                  <div>
                    <h4>{title}</h4>
                    <p>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button
              onClick={() => scrollTo("#manpower-request")}
              className="bws-btn-3d mt-7 bg-[#C2410C] text-white hover:bg-[#9A3412]"
            >
              Request Manpower
            </Button>
          </div>
        </div>
      </Section>

      {/* WORKER REGISTRATION */}
      <Section id="worker-registration" bg="bg-white">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.5fr]">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="bws-overline">{candidateLang === "kn" ? "ಅಭ್ಯರ್ಥಿಗಳಿಗಾಗಿ" : "For Workers"}</p>
              <CandidateLanguageToggle language={candidateLang} onChange={setCandidateLang} />
            </div>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0F2444] lg:text-4xl">
              {copy.workerTitle}
            </h2>
            <p className="mt-4 text-slate-600">{copy.workerIntro}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {(candidateLang === "kn" ? [
                ["01", "ವಿವರಗಳನ್ನು ನೀಡಿ"],
                ["02", "ಸ್ವವಿವರ ಪತ್ರ ಸೇರಿಸಿ (ಐಚ್ಛಿಕ)"],
                ["03", "ಸೂಕ್ತ ಅವಕಾಶ ಪಡೆಯಿರಿ"],
              ] : [
                ["01", "Create Profile"],
                ["02", "Add Resume (Optional)"],
                ["03", "Get Matched"],
              ]).map(([step, title]) => (
                <div key={step} className="bws-process-step">
                  <span>{step}</span>
                  <strong>{title}</strong>
                </div>
              ))}
            </div>
            <img
              src={IMAGES.assembly}
              alt="Technicians collaborating at a precision assembly workstation"
              loading="lazy"
              decoding="async"
              className="bws-image-soft mt-8 hidden h-64 w-full rounded-2xl object-cover lg:block"
            />
          </div>
          <div className="bws-panel-3d rounded-2xl border border-slate-200 bg-[#F8FAFC] p-6 sm:p-8">
            <WorkerForm language={candidateLang} />
          </div>
        </div>
      </Section>

      {/* MANPOWER REQUEST */}
      <Section id="manpower-request" bg="bg-[#F1F5F9]">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.5fr]">
          <div>
            <p className="bws-overline">For Companies</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0F2444] lg:text-4xl">
              Need Reliable Workforce?
            </h2>
            <p className="mt-4 text-slate-600">
              Share your requirement and our workforce team will respond with a deployment plan for your facility.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {[
                ["01", "Share Requirement"],
                ["02", "Candidate Screening"],
                ["03", "Workforce Deployment"],
              ].map(([step, title]) => (
                <div key={step} className="bws-process-step bws-process-step-company">
                  <span>{step}</span>
                  <strong>{title}</strong>
                </div>
              ))}
            </div>
            <div className="mt-8 space-y-3">
              {["Compliant contract staffing", "Multi-shift deployment", "Skilled to general workforce tiers"].map(
                (p) => (
                  <div key={p} className="flex items-center gap-3 rounded-md bg-white p-3 text-sm text-slate-700">
                    <ShieldCheck className="h-4 w-4 text-[#C2410C]" />
                    {p}
                  </div>
                ),
              )}
            </div>
          </div>
          <div className="bws-panel-3d rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <CompanyForm />
          </div>
        </div>
      </Section>

      {/* CLIENTS */}
      <Section id="clients" bg="bg-white">
        <Heading overline="Our Clients" title="Businesses We Support" subtitle="Serving production units and supply chains across Mysore industrial belts." />
        <div className="mx-auto mt-12 grid max-w-5xl gap-6 sm:grid-cols-2" data-testid="clients-grid">
          {clientsQuery.isPending ? (
            <p className="sm:col-span-2 text-center text-sm text-slate-500" role="status">Loading client profiles…</p>
          ) : clients.length > 0
            ? clients.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-[#F8FAFC] p-8 text-center transition-all duration-200 hover:-translate-y-1 hover:border-[#EA580C]/40 hover:shadow-md"
                    data-testid={`client-card-${c.id}`}
                  >
                    <ClientLogo client={c} />
                    <p className="text-sm font-semibold text-[#0F2444]">{c.name}</p>
                    {c.industry && <p className="text-xs text-slate-500">{c.industry}</p>}
                    {c.location && (
                      <p className="flex items-center gap-1 text-xs text-slate-500">
                        <MapPin className="h-3 w-3" /> {c.location}
                      </p>
                    )}
                    {c.service_summary && <p className="mt-2 text-sm text-slate-700">{c.service_summary}</p>}
                    {c.outcome && <p className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-[#0F2444]">{c.outcome}</p>}
                    {c.headcount && <p className="text-xs text-slate-500"><span className="font-semibold">Workforce deployed:</span> {c.headcount}</p>}
                  </div>
              ))
            : <div className="sm:col-span-2 rounded-xl border border-dashed border-slate-200 bg-[#F8FAFC] p-8 text-center text-slate-600">Contact our team to discuss workforce support for your business.</div>}
        </div>
      </Section>

      <RecruitmentFAQ language={candidateLang} />

      {/* CONTACT */}
      <Section id="contact" bg="bg-[#F1F5F9]">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <p className="bws-overline">Contact</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0F2444] lg:text-4xl">
              Get in Touch With Our Workforce Desk
            </h2>
            <ul className="mt-8 space-y-4 text-slate-700">
              <li className="flex gap-3">
                <MapPin className="mt-1 h-5 w-5 shrink-0 text-[#C2410C]" />
                <span>
                  <strong className="block text-[#0F2444]">{BRAND.name}</strong>
                  {BRAND.officeAddress || BRAND.location}
                </span>
              </li>
              <li className="flex gap-3">
                <PhoneCall className="mt-1 h-5 w-5 shrink-0 text-[#C2410C]" />
                <span data-testid="contact-phone">{BRAND.phone}</span>
              </li>
              <li className="flex gap-3">
                <Mail className="mt-1 h-5 w-5 shrink-0 text-[#C2410C]" />
                <span className="break-all" data-testid="contact-email">
                  {BRAND.email}
                </span>
              </li>
            </ul>
          </div>
          <div className="bws-contact-panel bws-panel-3d grid content-start gap-4 rounded-2xl border border-slate-200 bg-white p-8">
            <div className="mb-2">
              <p className="bws-overline">Fast Contact</p>
              <h3 className="mt-2 text-2xl font-semibold text-[#0F2444]">Choose how you want to reach us</h3>
              <p className="mt-2 text-sm text-slate-500">Our workforce desk will help with jobs, manpower requirements and general enquiries.</p>
            </div>
            <a
              href={`tel:${BRAND.phoneRaw}`}
              className="bws-contact-action flex items-center justify-center gap-2 rounded-xl bg-[#0F2444] px-6 py-4 font-semibold text-white hover:bg-[#0A172C]"
              data-testid="contact-btn-call"
            >
              <PhoneCall className="h-4 w-4" /> Call Now
            </a>
            <a
              href={BRAND.whatsapp}
              target="_blank"
              rel="noreferrer"
              className="bws-contact-action flex items-center justify-center gap-2 rounded-xl bg-[#16A34A] px-6 py-4 font-semibold text-white hover:bg-[#15803D]"
              data-testid="contact-btn-whatsapp"
            >
              <MessageSquare className="h-4 w-4" /> WhatsApp
            </a>
            <a
              href={`mailto:${BRAND.email}`}
              className="bws-contact-action flex items-center justify-center gap-2 rounded-xl bg-[#C2410C] px-6 py-4 font-semibold text-white hover:bg-[#9A3412]"
              data-testid="contact-btn-email"
            >
              <Mail className="h-4 w-4" /> Email
            </a>
          </div>
        </div>
      </Section>

      <Footer />
      <BusinessChat jobs={jobsQuery.data ?? null} clients={clientsQuery.data ?? null} />
    </div>
  );
}

function Section({ id, bg, children }: { id: string; bg: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`bws-section ${bg} py-20`}>
      <div className="relative mx-auto max-w-7xl px-6">{children}</div>
    </section>
  );
}

function Heading({ overline, title, subtitle }: { overline: string; title: string; subtitle: string }) {
  return (
    <div className="max-w-2xl" data-reveal>
      <p className="bws-overline">{overline}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0F2444] lg:text-4xl">{title}</h2>
      <p className="mt-4 text-slate-600">{subtitle}</p>
    </div>
  );
}

const CLIENT_LOGO_FALLBACKS: Record<string, string> = { "SSB Technologies": "/client-logos/ssbt.png", "Dhatu Organics & Naturals": "/client-logos/dhatu.jpg" };

function ClientLogo({ client }: { client: Client }) {
  const [step, setStep] = useState(0);
  const suppliedLogo = CLIENT_LOGO_FALLBACKS[client.name];
  const source = step === 0 && client.logo_filename
    ? `/api/clients/${client.id}/logo`
    : step <= 1 ? suppliedLogo : undefined;

  if (!source) {
    return <Building2 className="h-7 w-7 text-slate-400" aria-hidden="true" />;
  }
  return (
    <img
      src={source}
      alt={client.name}
      className="h-20 w-full max-w-[180px] object-contain"
      onError={() => setStep(step === 0 && client.logo_filename ? 1 : 2)}
    />
  );
}

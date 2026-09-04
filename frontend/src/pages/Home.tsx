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
  Handshake,
  MapPin,
  Mail,
  MessageSquare,
  PackageCheck,
  PhoneCall,
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
import WorkerForm from "@/components/site/WorkerForm";
import CompanyForm from "@/components/site/CompanyForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiGet } from "@/lib/api";
import { BRAND, IMAGES } from "@/lib/brand";
import type { Job } from "@/types";

const TRUST = [
  { icon: ReceiptText, title: "GST Registered", desc: "Official tax invoicing & compliance" },
  { icon: Award, title: "MSME Registered", desc: "Registered under MSME framework" },
  { icon: ShieldCheck, title: "ESIC Covered Employees", desc: "Employee welfare compliance" },
  { icon: FileBadge, title: "Licensed Labour Contractor", desc: "Authorized contract labour operations" },
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
  { title: "GST Registered", desc: `GST No: ${BRAND.gst}`, icon: ReceiptText },
  { title: "MSME Registered", desc: "Registered business under the MSME framework.", icon: Award },
  { title: "ESIC Employee Coverage", desc: "Employee welfare supported through ESIC compliance.", icon: ShieldCheck },
  { title: "Licensed Labour Contractor", desc: "Authorized contract labour operations.", icon: FileBadge },
];

const CLIENTS = [
  "Partner Company",
  "Partner Company",
  "Partner Company",
  "Partner Company",
  "Your Company Could Be Here",
];

function scrollTo(id: string) {
  document.querySelector(id)?.scrollIntoView({ behavior: "smooth" });
}

export default function Home() {
  const jobsQuery = useQuery({ queryKey: ["jobs"], queryFn: () => apiGet<Job[]>("/jobs") });
  const jobs = jobsQuery.isError ? [] : (jobsQuery.data ?? []);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar />

      {/* HERO */}
      <section id="home" className="relative overflow-hidden bg-[#0F2444]">
        <img src={IMAGES.hero} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(15,36,68,0.95)_0%,rgba(15,36,68,0.82)_60%,rgba(15,36,68,0.6)_100%)]" />
        <div className="relative mx-auto max-w-7xl px-6 py-20 lg:py-28">
          <div className="max-w-3xl bws-rise">
            <p className="bws-overline text-orange-400">Manpower Supply Partner · Mysore, Karnataka</p>
            <h1 className="mt-4 text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Reliable Workforce.
              <br />
              <span className="text-[#FB923C]">Stronger Businesses.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-200 sm:text-lg">
              Brothers Workforce Solutions connects businesses with dependable skilled, semi-skilled and general
              workforce solutions for factories, manufacturing units and industrial operations across Karnataka.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                onClick={() => scrollTo("#manpower-request")}
                className="bg-[#EA580C] px-7 py-6 text-base font-semibold text-white transition-transform duration-150 hover:bg-[#C2410C] active:scale-98"
                data-testid="hero-btn-request-manpower"
              >
                Request Manpower
              </Button>
              <Button
                onClick={() => scrollTo("#worker-registration")}
                variant="outline"
                className="border-white/40 bg-white/10 px-7 py-6 text-base font-semibold text-white backdrop-blur transition-transform duration-150 hover:bg-white hover:text-[#0F2444] active:scale-98"
                data-testid="hero-btn-apply-jobs"
              >
                Apply for Jobs
              </Button>
            </div>
          </div>

          <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="hero-trust-badges">
            {TRUST.map((t) => (
              <div
                key={t.title}
                className="rounded-md border border-white/20 bg-white/10 p-4 backdrop-blur-sm transition-colors duration-200 hover:border-orange-400/60"
              >
                <t.icon className="mb-2 h-5 w-5 text-[#FB923C]" />
                <p className="text-sm font-semibold text-white">{t.title}</p>
                <p className="mt-0.5 text-xs text-slate-300">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <Section id="about" bg="bg-white">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="bws-overline">About Us</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0F2444] lg:text-4xl">
              Your Trusted Workforce Partner
            </h2>
            <div className="mt-6 space-y-4 text-base leading-relaxed text-slate-600">
              <p>
                Brothers Workforce Solutions is a trusted manpower supply partner providing skilled, semi-skilled
                and general workforce solutions to factories, manufacturing units and businesses across Karnataka.
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
          <div className="relative">
            <img
              src={IMAGES.safety}
              alt="Trained workforce team in safety gear"
              className="h-[380px] w-full rounded-lg object-cover shadow-lg"
            />
            <div className="absolute -bottom-6 left-6 hidden rounded-md bg-[#0F2444] px-6 py-4 text-white shadow-xl sm:block">
              <p className="font-[family-name:var(--font-heading)] text-sm font-bold uppercase tracking-[0.18em] text-[#FB923C]">
                {BRAND.tagline}
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* SERVICES */}
      <Section id="services" bg="bg-[#F1F5F9]">
        <Heading overline="Our Services" title="Industrial Manpower Capabilities" subtitle="Workforce staffing tiers built for factory uptime, assembly precision and logistics efficiency." />
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s) => (
            <Card
              key={s.title}
              className="border-slate-200 bg-white transition-all duration-200 hover:-translate-y-1 hover:border-[#EA580C]/40 hover:shadow-md"
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
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#EA580C]" />
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
              className="flex items-center gap-4 rounded-md border border-slate-200 bg-[#F8FAFC] p-5 transition-all duration-200 hover:-translate-y-1 hover:border-[#EA580C]/40 hover:bg-white hover:shadow-md"
              data-testid={`industry-card-${i.name.toLowerCase().replace(/[^a-z]+/g, "-")}`}
            >
              <i.icon className="h-6 w-6 shrink-0 text-[#EA580C]" />
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
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {COMPLIANCE.map((c) => (
            <div
              key={c.title}
              className="rounded-md border border-white/15 bg-white/5 p-6 transition-colors duration-200 hover:border-[#FB923C]/60"
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
        <Heading overline="Recruitment" title="Current Job Openings" subtitle="Direct recruitment opportunities for industrial and factory placements." />
        <div className="mt-12" data-testid="job-listings">
          {jobs.length === 0 ? (
            <div
              className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center"
              data-testid="jobs-empty-state"
            >
              <Briefcase className="mx-auto mb-4 h-10 w-10 text-slate-400" />
              <p className="text-lg font-semibold text-[#0F2444]">
                No current openings. New opportunities will be updated soon.
              </p>
              <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
                Register your profile below and our recruitment team will contact you as soon as a matching role
                opens.
              </p>
              <Button
                className="mt-6 bg-[#EA580C] text-white hover:bg-[#C2410C]"
                onClick={() => scrollTo("#worker-registration")}
                data-testid="jobs-empty-cta"
              >
                Register Your Profile
              </Button>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {jobs.map((j) => (
                <Card
                  key={j.id}
                  className="border-slate-200 bg-white transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
                  data-testid={`job-card-${j.id}`}
                >
                  <CardContent className="p-6">
                    <Badge className="mb-3 bg-[#0F2444] text-white">{j.skill_category}</Badge>
                    <h3 className="text-lg font-semibold text-[#0F2444]" data-testid={`job-title-${j.id}`}>
                      {j.title}
                    </h3>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                      <MapPin className="h-3.5 w-3.5" /> {j.location}
                    </p>
                    <dl className="mt-4 space-y-1.5 text-sm text-slate-600">
                      {j.experience && <Row k="Experience" v={j.experience} />}
                      {j.salary && <Row k="Salary" v={j.salary} />}
                      {j.shift && <Row k="Shift" v={j.shift} />}
                      <Row k="Openings" v={String(j.openings)} />
                    </dl>
                    {j.description && <p className="mt-3 text-sm text-slate-500">{j.description}</p>}
                    <Button
                      className="mt-5 w-full bg-[#EA580C] text-white hover:bg-[#C2410C]"
                      onClick={() => scrollTo("#worker-registration")}
                      data-testid={`job-apply-${j.id}`}
                    >
                      Apply
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* WORKER REGISTRATION */}
      <Section id="worker-registration" bg="bg-white">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.5fr]">
          <div>
            <p className="bws-overline">For Workers</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0F2444] lg:text-4xl">
              Looking For Job Opportunities?
            </h2>
            <p className="mt-4 text-slate-600">
              Register once and our recruitment team will match you to factory, warehouse and technical roles as
              they open across Karnataka.
            </p>
            <img
              src={IMAGES.assembly}
              alt="Industrial workforce on an assembly line"
              className="mt-8 hidden h-64 w-full rounded-lg object-cover lg:block"
            />
          </div>
          <div className="rounded-lg border border-slate-200 bg-[#F8FAFC] p-6 sm:p-8">
            <WorkerForm />
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
            <div className="mt-8 space-y-3">
              {["Compliant contract staffing", "Multi-shift deployment", "Skilled to general workforce tiers"].map(
                (p) => (
                  <div key={p} className="flex items-center gap-3 rounded-md bg-white p-3 text-sm text-slate-700">
                    <ShieldCheck className="h-4 w-4 text-[#EA580C]" />
                    {p}
                  </div>
                ),
              )}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-6 sm:p-8">
            <CompanyForm />
          </div>
        </div>
      </Section>

      {/* CLIENTS */}
      <Section id="clients" bg="bg-white">
        <Heading overline="Our Clients" title="Businesses We Support" subtitle="Serving production units and supply chains across Mysore industrial belts." />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-5" data-testid="clients-grid">
          {CLIENTS.map((c, idx) => (
            <div
              key={idx}
              className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-slate-300 bg-[#F8FAFC] p-8 text-center transition-colors duration-200 hover:border-[#EA580C]/50"
              data-testid={`client-placeholder-${idx}`}
            >
              {idx === CLIENTS.length - 1 ? (
                <Handshake className="h-7 w-7 text-[#EA580C]" />
              ) : (
                <Building2 className="h-7 w-7 text-slate-400" />
              )}
              <p className="text-sm font-medium text-slate-600">{c}</p>
            </div>
          ))}
        </div>
      </Section>

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
                <MapPin className="mt-1 h-5 w-5 shrink-0 text-[#EA580C]" />
                <span>
                  <strong className="block text-[#0F2444]">{BRAND.name}</strong>
                  {BRAND.location}
                </span>
              </li>
              <li className="flex gap-3">
                <PhoneCall className="mt-1 h-5 w-5 shrink-0 text-[#EA580C]" />
                <span data-testid="contact-phone">{BRAND.phone}</span>
              </li>
              <li className="flex gap-3">
                <Mail className="mt-1 h-5 w-5 shrink-0 text-[#EA580C]" />
                <span className="break-all" data-testid="contact-email">
                  {BRAND.email}
                </span>
              </li>
            </ul>
          </div>
          <div className="grid content-start gap-4 rounded-lg border border-slate-200 bg-white p-8">
            <a
              href={`tel:${BRAND.phoneRaw}`}
              className="flex items-center justify-center gap-2 rounded-md bg-[#0F2444] px-6 py-4 font-semibold text-white transition-transform duration-150 hover:bg-[#0A172C] active:scale-98"
              data-testid="contact-btn-call"
            >
              <PhoneCall className="h-4 w-4" /> Call Now
            </a>
            <a
              href={BRAND.whatsapp}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-md bg-[#16A34A] px-6 py-4 font-semibold text-white transition-transform duration-150 hover:bg-[#15803D] active:scale-98"
              data-testid="contact-btn-whatsapp"
            >
              <MessageSquare className="h-4 w-4" /> WhatsApp
            </a>
            <a
              href={`mailto:${BRAND.email}`}
              className="flex items-center justify-center gap-2 rounded-md bg-[#EA580C] px-6 py-4 font-semibold text-white transition-transform duration-150 hover:bg-[#C2410C] active:scale-98"
              data-testid="contact-btn-email"
            >
              <Mail className="h-4 w-4" /> Email
            </a>
          </div>
        </div>
      </Section>

      <Footer />
    </div>
  );
}

function Section({ id, bg, children }: { id: string; bg: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`${bg} py-20`}>
      <div className="mx-auto max-w-7xl px-6">{children}</div>
    </section>
  );
}

function Heading({ overline, title, subtitle }: { overline: string; title: string; subtitle: string }) {
  return (
    <div className="max-w-2xl">
      <p className="bws-overline">{overline}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0F2444] lg:text-4xl">{title}</h2>
      <p className="mt-4 text-slate-600">{subtitle}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 pb-1">
      <dt className="text-slate-500">{k}</dt>
      <dd className="font-medium text-[#0F2444]">{v}</dd>
    </div>
  );
}

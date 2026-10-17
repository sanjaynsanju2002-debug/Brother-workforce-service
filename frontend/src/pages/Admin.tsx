import { translateText, useSiteLanguage } from "@/lib/language";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Briefcase, Building2, Download, Eye, FileText, Loader2, Lock, MailWarning, Menu, MessageSquare, Plus, Trash2, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EmailSettings from "@/components/site/EmailSettings";
import ClientsManager from "@/components/site/ClientsManager";
import WorkforceManager from "@/components/site/WorkforceManager";
import Security from "@/components/site/Security";
import TrafficChart from "@/components/site/TrafficChart";
import Shortlists from "@/components/site/Shortlists";
import JobMatches from "@/components/site/JobMatches";
import TalentBank from "@/components/site/TalentBank";
import Invoices from "@/components/site/Invoices";
import Expenses from "@/components/site/Expenses";
import ProfitLoss from "@/components/site/ProfitLoss";
import Payroll from "@/components/site/Payroll";
import { waLink, workerMessage, companyMessage } from "@/lib/wa";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import { BRAND, SKILL_CATEGORIES } from "@/lib/brand";
import type { AdminStats, CompanyRequest, EnquiryAging, Job, JobApplicationCount, JobCreate, Ok, Shortlist, TrafficStats, Worker, WorkerFilters } from "@/types";
import LanguageSelector from "@/components/site/LanguageSelector";
import { usePageTitle } from "@/lib/language";

const EMPTY_FILTERS = { skill_category: "", location: "", availability: "", status: "", q: "" };

const WORKER_STATUS = ["New", "Contacted", "Deployed", "Archived"];
const REQUEST_STATUS = ["Pending", "Quote Sent", "In Progress", "Closed"];
export default function Admin() {
  useSiteLanguage();
  usePageTitle("Admin | Brothers Workforce Solutions");
  useEffect(() => {
    const existingRobots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previousRobots = existingRobots?.content;
    const robots = existingRobots ?? document.createElement("meta");

    if (!existingRobots) {
      robots.name = "robots";
      document.head.appendChild(robots);
    }

    robots.content = "noindex, nofollow, noarchive";

    return () => {
      if (existingRobots && previousRobots !== undefined) {
        existingRobots.content = previousRobots;
      } else if (!existingRobots) {
        robots.remove();
      }
    };
  }, []);

  const [pin, setPin] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loggedOut, setLoggedOut] = useState(false);
  const qc = useQueryClient();
  const session = useQuery({
    queryKey: ["admin-me"],
    queryFn: () => apiGet<Ok>("/admin/me"),
    retry: false,
  });

  const login = useMutation({
    mutationFn: (p: string) => apiPost<Ok>("/admin/login", { pin: p }),
    onSuccess: () => {
      setPin("");
      qc.clear();
      setLoggedOut(false);
      setAuthenticated(true);
      toast.success(translateText("Signed in"));
    },
    onError: (error) => toast.error(translateText(error instanceof ApiError && error.status === 429 ? "Too many attempts. Try again in 15 minutes." : "Invalid PIN")),
  });

  if (session.isPending && !authenticated) {
    return <div className="flex min-h-screen items-center justify-center bg-[#0F2444] text-white"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  }

  if (!authenticated && (loggedOut || !session.isSuccess)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0F2444] px-6">
        <div className="absolute right-4 top-4"><LanguageSelector /></div>
        <Card className="w-full max-w-sm border-slate-200 bg-white" data-testid="admin-login-card">
          <CardContent className="p-8">
            <img src={BRAND.logo} alt="" className="mx-auto mb-4 h-16 w-16 object-contain" />
            <h1 className="text-center text-xl font-bold text-[#0F2444]">{translateText("Admin Access")}</h1>
            <p className="mt-1 text-center text-sm text-slate-500">{translateText("Enter your security PIN to continue")}</p>
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                login.mutate(pin);
              }}
            >
              <div>
                <Label htmlFor="admin-security-pin" className="mb-2 block text-sm">{translateText("Security PIN")}</Label>
                <Input
                  id="admin-security-pin" type="password" autoComplete="current-password" inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••••"
                  data-testid="admin-pin-input"
                />
              </div>
              <Button
                type="submit"
                disabled={login.isPending}
                className="w-full bg-[#C2410C] text-white hover:bg-[#9A3412]"
                data-testid="admin-pin-submit"
              >
                {login.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}{translateText("Unlock Dashboard")}</Button>
            </form>
            <Link to="/" className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-[#0F2444]">
              <ArrowLeft className="h-3.5 w-3.5" />{translateText(" Back to website")}</Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Dashboard
      pin="session"
      onLogout={async () => {
        try { await apiPost<Ok>("/admin/logout"); } finally {
          qc.clear();
          setLoggedOut(true);
          setAuthenticated(false);
        }
      }}
      onPinChanged={() => {
        qc.clear();
        setLoggedOut(true);
        setAuthenticated(false);
      }}
    />
  );
}

function Dashboard({
  pin,
  onLogout,
  onPinChanged,
}: {
  pin: string;
  onLogout: () => void;
  onPinChanged: () => void;
}) {
  useSiteLanguage();
  const qc = useQueryClient();
  const q = "";
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [matchJobId, setMatchJobId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const shortlists = useQuery({
    queryKey: ["admin-shortlists", pin],
    queryFn: () => apiGet<Shortlist[]>(`/admin/shortlists${q}`),
  });

  const addToShortlist = useMutation({
    mutationFn: (v: { slId: string; workerId: string }) =>
      apiPost<Shortlist>(`/admin/shortlists/${v.slId}/workers${q}`, { worker_id: v.workerId }),
    onSuccess: (sl) => {
      qc.invalidateQueries({ queryKey: ["admin-shortlists", pin] });
      qc.invalidateQueries({ queryKey: ["shortlist-members", pin] });
      toast.success(translateText(`Added to "${sl.name}"`));
    },
    onError: () => toast.error(translateText("Could not add to shortlist")),
  });

  const stats = useQuery({ queryKey: ["admin-stats", pin], queryFn: () => apiGet<AdminStats>(`/admin/stats${q}`) });
  const trafficQ = useQuery({
    queryKey: ["admin-traffic", pin],
    queryFn: () => apiGet<TrafficStats>(`/admin/traffic${q}`),
  });
  const workers = useQuery({
    queryKey: ["admin-workers", pin, filters],
    queryFn: () => {
      const p = new URLSearchParams();
      if (filters.skill_category) p.set("skill_category", filters.skill_category);
      if (filters.location) p.set("location", filters.location);
      if (filters.availability) p.set("availability", filters.availability);
      if (filters.status) p.set("status", filters.status);
      if (filters.q) p.set("q", filters.q);
      return apiGet<Worker[]>(`/admin/workers?${p.toString()}`);
    },
  });
  const filterOptions = useQuery({
    queryKey: ["admin-worker-filters", pin],
    queryFn: () => apiGet<WorkerFilters>(`/admin/worker-filters${q}`),
  });
  const requests = useQuery({
    queryKey: ["admin-requests", pin],
    queryFn: () => apiGet<CompanyRequest[]>(`/admin/company-requests${q}`),
  });
  const jobs = useQuery({ queryKey: ["admin-jobs", pin], queryFn: () => apiGet<Job[]>(`/admin/jobs${q}`) });
  const applicationsByJob = useQuery({
    queryKey: ["admin-job-applications", pin],
    queryFn: () => apiGet<JobApplicationCount[]>("/admin/job-applications"),
  });
  const enquiryAging = useQuery({
    queryKey: ["admin-enquiry-aging", pin],
    queryFn: () => apiGet<EnquiryAging>("/admin/enquiry-aging"),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-stats", pin] });
    qc.invalidateQueries({ queryKey: ["admin-jobs", pin] });
    qc.invalidateQueries({ queryKey: ["admin-job-applications", pin] });
    qc.invalidateQueries({ queryKey: ["jobs"] });
  };

  const workerStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) =>
      apiPatch<Worker>(`/admin/workers/${v.id}${q}`, { status: v.status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-workers", pin] });
      toast.success(translateText("Status updated"));
    },
  });

  const removeWorker = useMutation({
    mutationFn: (id: string) => apiDelete<Ok>(`/admin/workers/${id}${q}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-workers", pin] });
      qc.invalidateQueries({ queryKey: ["admin-worker-filters", pin] });
      qc.invalidateQueries({ queryKey: ["admin-stats", pin] });
      qc.invalidateQueries({ queryKey: ["admin-job-applications", pin] });
      qc.invalidateQueries({ queryKey: ["admin-traffic", pin] });
      qc.invalidateQueries({ queryKey: ["admin-shortlists", pin] });
      qc.invalidateQueries({ queryKey: ["shortlist-members", pin] });
      toast.success(translateText("Application permanently deleted"));
    },
    onError: () => toast.error(translateText("Could not delete application")),
  });

  const requestStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) =>
      apiPatch<CompanyRequest>(`/admin/company-requests/${v.id}${q}`, { status: v.status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-requests", pin] });
      qc.invalidateQueries({ queryKey: ["admin-stats", pin] });
      qc.invalidateQueries({ queryKey: ["admin-enquiry-aging", pin] });
      toast.success(translateText("Status updated"));
    },
  });

  const removeRequest = useMutation({
    mutationFn: (id: string) => apiDelete<Ok>(`/admin/company-requests/${id}${q}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-requests", pin] });
      qc.invalidateQueries({ queryKey: ["admin-stats", pin] });
      qc.invalidateQueries({ queryKey: ["admin-traffic", pin] });
      qc.invalidateQueries({ queryKey: ["admin-enquiry-aging", pin] });
      toast.success(translateText("Company enquiry permanently deleted"));
    },
    onError: () => toast.error(translateText("Could not delete company enquiry")),
  });

  const createJob = useMutation({
    mutationFn: (payload: JobCreate) => apiPost<Job>(`/admin/jobs${q}`, payload),
    onSuccess: () => {
      invalidate();
      toast.success(translateText("Job posted"));
    },
    onError: () => toast.error(translateText("Could not post job")),
  });

  const toggleJob = useMutation({
    mutationFn: (v: { id: string; active: boolean }) =>
      apiPatch<Job>(`/admin/jobs/${v.id}${q}`, { active: v.active }),
    onSuccess: invalidate,
  });

  const removeJob = useMutation({
    mutationFn: (id: string) => apiDelete<Ok>(`/admin/jobs/${id}${q}`),
    onSuccess: () => {
      invalidate();
      toast.success(translateText("Job removed"));
    },
  });

  const [job, setJob] = useState<JobCreate>({
    title: "",
    location: "",
    skill_category: "Skilled",
    experience: "",
    salary: "",
    shift: "",
    openings: 1,
    description: "",
    description_kn: "",
    closing_date: "",
    employer_name: "",
  });
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const editJob = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: JobCreate }) => apiPut<Job>(`/admin/jobs/${id}`, payload),
    onSuccess: () => {
      invalidate();
      setEditingJobId(null);
      setJob({ title: "", location: "", skill_category: "Skilled", experience: "", salary: "", shift: "", openings: 1, description: "", description_kn: "", closing_date: "", employer_name: "" });
      toast.success(translateText("Job updated"));
    },
    onError: () => toast.error(translateText("Could not update job")),
  });

  const s = stats.data;
  const t = trafficQ.data;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-6 sm:py-4">
          <img src={BRAND.logo} alt="" className="h-10 w-10 object-contain" />
          <div>
            <p className="font-[family-name:var(--font-heading)] text-sm font-bold text-[#0F2444]">{translateText("ADMIN DASHBOARD")}</p>
            <p className="text-xs text-slate-500">{translateText("Brothers Workforce Solutions")}</p>
          </div>
          <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <LanguageSelector />
            <Link to="/" className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-center text-sm text-slate-600 hover:text-[#0F2444] sm:flex-none sm:px-4">{translateText("View Site")}</Link>
            <Button variant="outline" onClick={onLogout} className="flex-1 sm:flex-none" data-testid="admin-logout">{translateText("Lock")}</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-5 sm:px-6 sm:py-8">
        <Tabs defaultValue="overview" orientation="vertical" className="flex flex-col gap-6 lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start" aria-label={translateText("Admin sections")}>
            <button type="button" className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 font-semibold text-[#0F2444] lg:hidden" onClick={() => setSidebarOpen((open) => !open)} aria-expanded={sidebarOpen} aria-controls="admin-sidebar-menu" data-testid="admin-sidebar-toggle">{translateText("Dashboard menu ")}<Menu className="h-5 w-5" />
            </button>
            <div id="admin-sidebar-menu" className={`${sidebarOpen ? "block" : "hidden"} mt-2 lg:mt-0 lg:block`}>
              <p className="mb-2 hidden px-3 text-xs font-bold uppercase tracking-widest text-slate-500 lg:block">{translateText("Dashboard")}</p>
              <TabsList className="flex h-auto w-full flex-col items-stretch gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-sm group-data-vertical/tabs:h-auto" data-testid="admin-sidebar" onClick={() => setSidebarOpen(false)}>
                <TabsTrigger value="overview" className="min-h-10 w-full justify-start px-3 text-left whitespace-normal" data-testid="admin-tab-overview">{translateText("Overview")}</TabsTrigger>
                <TabsTrigger value="workers" className="min-h-10 w-full justify-start px-3 text-left whitespace-normal" data-testid="admin-tab-workers">{translateText("Worker Applications")}</TabsTrigger>
                <TabsTrigger value="talents" className="min-h-10 w-full justify-start px-3 text-left whitespace-normal" data-testid="admin-tab-talents">{translateText("Talent Bank")}</TabsTrigger>
                <TabsTrigger value="workforce" className="min-h-10 w-full justify-start px-3 text-left whitespace-normal" data-testid="admin-tab-workforce">{translateText("Company Workforce")}</TabsTrigger>
                <TabsTrigger value="payroll" className="min-h-10 w-full justify-start px-3 text-left whitespace-normal" data-testid="admin-tab-payroll">{translateText("Payroll")}</TabsTrigger>
                <TabsTrigger value="requests" className="min-h-10 w-full justify-start px-3 text-left whitespace-normal" data-testid="admin-tab-requests">{translateText("Company Enquiries")}</TabsTrigger>
                <TabsTrigger value="clients" className="min-h-10 w-full justify-start px-3 text-left whitespace-normal" data-testid="admin-tab-clients">{translateText("Clients")}</TabsTrigger>
                <TabsTrigger value="invoices" className="min-h-10 w-full justify-start px-3 text-left whitespace-normal" data-testid="admin-tab-invoices">{translateText("Invoices")}</TabsTrigger>
                <TabsTrigger value="expenses" className="min-h-10 w-full justify-start px-3 text-left whitespace-normal" data-testid="admin-tab-expenses">{translateText("Expenses")}</TabsTrigger>
                <TabsTrigger value="profit-loss" className="min-h-10 w-full justify-start px-3 text-left whitespace-normal" data-testid="admin-tab-profit-loss">{translateText("Profit & Loss")}</TabsTrigger>
                <TabsTrigger value="jobs" className="min-h-10 w-full justify-start px-3 text-left whitespace-normal" data-testid="admin-tab-jobs">{translateText("Job Postings")}</TabsTrigger>
                <TabsTrigger value="email" className="min-h-10 w-full justify-start px-3 text-left whitespace-normal" data-testid="admin-tab-email">{translateText("Email Settings")}</TabsTrigger>
                <TabsTrigger value="security" className="min-h-10 w-full justify-start px-3 text-left whitespace-normal" data-testid="admin-tab-security">{translateText("Security")}</TabsTrigger>
                <TabsTrigger value="shortlists" className="min-h-10 w-full justify-start px-3 text-left whitespace-normal" data-testid="admin-tab-shortlists">{translateText("Shortlists")}</TabsTrigger>
              </TabsList>
            </div>
          </aside>
          <div className="min-w-0">
            <TabsContent value="overview" className="mt-0">
              <div className="mb-5">
                <h1 className="text-2xl font-bold text-[#0F2444]">{translateText("Overview")}</h1>
                <p className="mt-1 text-sm text-slate-500">{translateText("Key totals and website activity in one place.")}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="admin-stats">
                <Stat icon={Users} label={translateText("Worker Applications")} value={s?.workers ?? 0} testid="stat-workers" />
                <Stat icon={FileText} label={translateText("Company Enquiries")} value={s?.requests ?? 0} testid="stat-requests" />
                <Stat icon={FileText} label={translateText("Pending Enquiries")} value={s?.open_requests ?? 0} testid="stat-open-requests" />
                <Stat icon={Briefcase} label={translateText("Active Jobs")} value={s?.active_jobs ?? 0} testid="stat-active-jobs" />
              </div>

              <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 sm:p-6" data-testid="admin-traffic">
                <h2 className="flex items-center gap-2 text-base font-semibold text-[#0F2444]">
                  <TrendingUp className="h-4 w-4 text-[#C2410C]" />{translateText(" Website Activity")}</h2>
                <p className="mt-1 text-sm text-slate-500">{translateText("Anonymous visit counts — one per visitor session. No personal data is tracked.")}</p>
                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  <Funnel
                    icon={Eye}
                    label={translateText("People Visited")}
                    total={t?.visits_total ?? 0}
                    today={t?.visits_today ?? 0}
                    week={t?.visits_week}
                    testid="funnel-visits"
                  />
                  <Funnel
                    icon={Users}
                    label={translateText("Registered for Work")}
                    total={t?.workers_total ?? 0}
                    today={t?.workers_today ?? 0}
                    testid="funnel-applications"
                  />
                  <Funnel
                    icon={Building2}
                    label={translateText("Requested Manpower")}
                    total={t?.requests_total ?? 0}
                    today={t?.requests_today ?? 0}
                    testid="funnel-requests"
                  />
                </div>
              </div>

              <TrafficChart pin={pin} />
              <div className="mt-6 grid gap-4 md:grid-cols-2" data-testid="admin-action-metrics">
                <div className="rounded-lg border border-slate-200 bg-white p-5">
                  <h2 className="font-semibold text-[#0F2444]">{translateText("Pending enquiry follow-up")}</h2>
                  <p className="mt-3 text-3xl font-bold text-[#C2410C]">{translateText(enquiryAging.data?.older_than_2_days ?? 0)}</p>
                  <p className="text-sm text-slate-600">{translateText("Pending for more than 2 days")}</p>
                  <p className="mt-2 text-xs text-slate-500">{translateText(enquiryAging.data?.pending_total ?? 0)}{translateText(" pending total · oldest ")}{translateText(enquiryAging.data?.oldest_days ?? 0)}{translateText(" days")}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-5">
                  <h2 className="font-semibold text-[#0F2444]">{translateText("Applications by job")}</h2>
                  <div className="mt-3 max-h-44 space-y-2 overflow-auto text-sm">
                    {(applicationsByJob.data ?? []).length === 0 && <p className="text-slate-500">{translateText("No posted jobs yet.")}</p>}
                    {(applicationsByJob.data ?? []).map((item) => (
                      <div key={item.job_id} className="flex justify-between gap-4 border-b pb-2">
                        <span className="truncate">{translateText(item.title)}</span><strong>{translateText(item.applications)}</strong>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{translateText("Counts applications linked to each listed role; general registrations are separate.")}</p>
                </div>
              </div>

              {s && !s.email_configured && (
                <div
                  className="mt-4 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4"
                  data-testid="admin-email-warning"
                >
                  <MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div className="text-sm text-amber-900">
                    <strong>{translateText("Email alerts are not active yet.")}</strong>{translateText(" Submissions are still saved and shown here. Add your Resend API key as ")}<code className="rounded bg-amber-100 px-1">{translateText("RESEND_API_KEY")}</code>{translateText(" in the backend environment, then use the ")}<strong>{translateText("Email Settings")}</strong>{translateText(" tab to send a test.")}</div>
                </div>
              )}
            </TabsContent>
          <TabsContent value="workers" className="mt-6">
            <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4" data-testid="worker-filters">
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-full min-w-0 flex-1 sm:min-w-[200px]">
                  <Label className="mb-1.5 block text-xs text-slate-500">{translateText("Search name, phone or skill")}</Label>
                  <Input
                    placeholder={translateText("e.g. welder, 98765…")}
                    value={filters.q}
                    onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                    data-testid="worker-filter-search"
                  />
                </div>
                <FilterSelect
                  label={translateText("Skill Category")}
                  value={filters.skill_category}
                  options={filterOptions.data?.skill_categories ?? []}
                  onChange={(v) => setFilters({ ...filters, skill_category: v })}
                  testid="worker-filter-skill"
                />
                <FilterSelect
                  label={translateText("Location")}
                  value={filters.location}
                  options={filterOptions.data?.locations ?? []}
                  onChange={(v) => setFilters({ ...filters, location: v })}
                  testid="worker-filter-location"
                />
                <FilterSelect
                  label={translateText("Availability")}
                  value={filters.availability}
                  options={filterOptions.data?.availabilities ?? []}
                  onChange={(v) => setFilters({ ...filters, availability: v })}
                  testid="worker-filter-availability"
                />
                <FilterSelect
                  label={translateText("Status")}
                  value={filters.status}
                  options={WORKER_STATUS}
                  onChange={(v) => setFilters({ ...filters, status: v })}
                  testid="worker-filter-status"
                />
                <Button
                  variant="outline"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                  data-testid="worker-filter-clear"
                >{translateText("Clear")}</Button>
              </div>
              <p className="mt-3 text-xs text-slate-500" data-testid="worker-filter-count">{translateText("Showing ")}{translateText((workers.data ?? []).length)}{translateText(" candidate")}{translateText((workers.data ?? []).length === 1 ? "" : "s")}
              </p>
            </div>
            <div className="mb-4 flex justify-end">
              <a
                href={`/api/admin/export/workers.csv${q}`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#0F2444] px-4 py-2 text-sm font-semibold text-white transition-transform duration-150 hover:bg-[#0A172C] active:scale-98 sm:w-auto"
                data-testid="admin-export-workers"
              >
                <Download className="h-4 w-4" />{translateText(" Download Spreadsheet")}</a>
            </div>
            <Card className="border-slate-200 bg-white">
              <CardContent className="p-0">
                <Table data-testid="admin-workers-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{translateText("Name")}</TableHead>
                      <TableHead>{translateText("Mobile")}</TableHead>
                      <TableHead>{translateText("Applied For")}</TableHead>
                      <TableHead>{translateText("Category")}</TableHead>
                      <TableHead>{translateText("Location")}</TableHead>
                      <TableHead>{translateText("Resume")}</TableHead>
                      <TableHead>{translateText("Status")}</TableHead>
                      <TableHead>{translateText("Actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(workers.data ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="py-10 text-center text-slate-500">{translateText("No worker applications yet.")}</TableCell>
                      </TableRow>
                    )}
                    {(workers.data ?? []).map((w) => (
                      <TableRow key={w.id} data-testid={`admin-worker-row-${w.id}`}>
                        <TableCell className="font-medium text-[#0F2444]">{w.full_name}</TableCell>
                        <TableCell>{w.mobile}</TableCell>
                        <TableCell>{translateText(w.job_title || "General registration")}</TableCell>
                        <TableCell>{translateText(w.skill_category)}</TableCell>
                        <TableCell>{translateText(w.current_location)}</TableCell>
                        <TableCell>
                          {w.resume_filename ? (
                            <a
                              href={`/api/workers/${w.id}/resume${q}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#C2410C] underline"
                            >{translateText("Download")}</a>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={w.status}
                            onValueChange={(v: string) => workerStatus.mutate({ id: w.id, status: v })}
                          >
                            <SelectTrigger size="sm" data-testid={`admin-worker-status-${w.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {WORKER_STATUS.map((st) => (
                                <SelectItem key={st} value={st}>
                                  {translateText(st)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <a
                              href={waLink(w.whatsapp || w.mobile, workerMessage(w.full_name))}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-md bg-[#16A34A] px-2.5 py-1.5 text-xs font-semibold text-white transition-transform duration-150 hover:bg-[#15803D] active:scale-98"
                              data-testid={`admin-worker-whatsapp-${w.id}`}
                            >
                              <MessageSquare className="h-3.5 w-3.5" />{translateText(" WhatsApp")}</a>
                            {(shortlists.data ?? []).length > 0 && (
                              <Select
                                value=""
                                onValueChange={(slId: string) =>
                                  addToShortlist.mutate({ slId, workerId: w.id })
                                }
                              >
                                <SelectTrigger size="sm" data-testid={`worker-shortlist-add-${w.id}`}>
                                  <SelectValue placeholder={translateText("Shortlist")}>{translateText(() => "Shortlist")}</SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {(shortlists.data ?? []).map((sl) => (
                                    <SelectItem key={sl.id} value={sl.id}>
                                      {translateText(sl.name)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="destructive"
                              disabled={removeWorker.isPending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    translateText(`Permanently delete ${w.full_name}'s application? This will also remove the record from the backend database and delete the stored resume.`)
                                  )
                                ) {
                                  removeWorker.mutate(w.id);
                                }
                              }}
                              aria-label={translateText(`Delete ${w.full_name}'s application`)}
                              title={translateText("Delete application permanently")}
                              data-testid={`admin-worker-delete-${w.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="talents" className="mt-6">
            <TalentBank pin={pin} />
          </TabsContent>

          <TabsContent value="requests" className="mt-6">
            <div className="mb-4 flex justify-end">
              <a
                href={`/api/admin/export/company-requests.csv${q}`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#0F2444] px-4 py-2 text-sm font-semibold text-white transition-transform duration-150 hover:bg-[#0A172C] active:scale-98 sm:w-auto"
                data-testid="admin-export-requests"
              >
                <Download className="h-4 w-4" />{translateText(" Download Spreadsheet")}</a>
            </div>
            <Card className="border-slate-200 bg-white">
              <CardContent className="p-0">
                <Table data-testid="admin-requests-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{translateText("Company")}</TableHead>
                      <TableHead>{translateText("Contact")}</TableHead>
                      <TableHead>{translateText("Role")}</TableHead>
                      <TableHead>{translateText("Count")}</TableHead>
                      <TableHead>{translateText("Industry")}</TableHead>
                      <TableHead>{translateText("Status")}</TableHead>
                      <TableHead>{translateText("Actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(requests.data ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-slate-500">{translateText("No company enquiries yet.")}</TableCell>
                      </TableRow>
                    )}
                    {(requests.data ?? []).map((r) => (
                      <TableRow key={r.id} data-testid={`admin-request-row-${r.id}`}>
                        <TableCell className="font-medium text-[#0F2444]">{r.company_name}</TableCell>
                        <TableCell>
                          {r.contact_person}
                          <span className="block text-xs text-slate-500">{r.mobile}</span>
                        </TableCell>
                        <TableCell>{translateText(r.job_role)}</TableCell>
                        <TableCell>{translateText(r.worker_count)}</TableCell>
                        <TableCell>{translateText(r.industry)}</TableCell>
                        <TableCell>
                          <Select
                            value={r.status}
                            onValueChange={(v: string) => requestStatus.mutate({ id: r.id, status: v })}
                          >
                            <SelectTrigger size="sm" data-testid={`admin-request-status-${r.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {REQUEST_STATUS.map((st) => (
                                <SelectItem key={st} value={st}>
                                  {translateText(st)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <a
                              href={waLink(r.mobile, companyMessage(r.company_name, r.job_role, r.worker_count))}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-md bg-[#16A34A] px-2.5 py-1.5 text-xs font-semibold text-white transition-transform duration-150 hover:bg-[#15803D] active:scale-98"
                              data-testid={`admin-request-whatsapp-${r.id}`}
                            >
                              <MessageSquare className="h-3.5 w-3.5" />{translateText(" WhatsApp")}</a>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="destructive"
                              disabled={removeRequest.isPending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    translateText(`Permanently delete the enquiry from ${r.company_name}? This cannot be undone.`)
                                  )
                                ) {
                                  removeRequest.mutate(r.id);
                                }
                              }}
                              aria-label={translateText(`Delete ${r.company_name} enquiry`)}
                              title={translateText("Delete enquiry permanently")}
                              data-testid={`admin-request-delete-${r.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="jobs" className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            <Card className="border-slate-200 bg-white">
              <CardContent className="p-4 sm:p-6">
                <h3 className="mb-4 text-lg font-semibold text-[#0F2444]">{translateText(editingJobId ? "Edit Job" : "Post a New Job")}</h3>
                <form
                  className="space-y-3"
                  data-testid="admin-job-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!job.title || !job.location) {
                      toast.error(translateText("Title and location are required"));
                      return;
                    }
                    if (!Number.isInteger(job.openings) || job.openings < 1) {
                      toast.error(translateText("Enter at least 1 opening"));
                      return;
                    }
                    if ((job.description ?? "").trim().length < 40) {
                      toast.error(translateText("Add a full job description with duties, qualifications, skills and working hours"));
                      return;
                    }
                    if (editingJobId) {
                      editJob.mutate({ id: editingJobId, payload: job });
                      return;
                    }
                    createJob.mutate(job, {
                      onSuccess: () =>
                        setJob({
                          title: "",
                          location: "",
                          skill_category: "Skilled",
                          experience: "",
                          salary: "",
                          shift: "",
                          openings: 1,
                          description: "",
                          description_kn: "",
                          closing_date: "",
                          employer_name: "",
                        }),
                    });
                  }}
                >
                  <Input
                    placeholder={translateText("Job title *")}
                    value={job.title}
                    onChange={(e) => setJob({ ...job, title: e.target.value })}
                    data-testid="admin-job-title"
                  />
                  <Input
                    placeholder={translateText("Location *")}
                    value={job.location}
                    onChange={(e) => setJob({ ...job, location: e.target.value })}
                    data-testid="admin-job-location"
                  />
                  <Select
                    value={job.skill_category}
                    onValueChange={(v: string) => setJob({ ...job, skill_category: v })}
                  >
                    <SelectTrigger data-testid="admin-job-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SKILL_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {translateText(c)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder={translateText("Experience required")}
                    value={job.experience ?? ""}
                    onChange={(e) => setJob({ ...job, experience: e.target.value })}
                    data-testid="admin-job-experience"
                  />
                  <Input
                    placeholder={translateText("Salary (optional)")}
                    value={job.salary ?? ""}
                    onChange={(e) => setJob({ ...job, salary: e.target.value })}
                    data-testid="admin-job-salary"
                  />
                  <Input
                    placeholder={translateText("Shift")}
                    value={job.shift ?? ""}
                    onChange={(e) => setJob({ ...job, shift: e.target.value })}
                    data-testid="admin-job-shift"
                  />
                  <Input
                    placeholder={translateText("Hiring company (leave blank if confidential)")}
                    value={job.employer_name ?? ""}
                    onChange={(e) => setJob({ ...job, employer_name: e.target.value })}
                    data-testid="admin-job-employer"
                  />
                  <div>
                    <Label htmlFor="admin-job-closing-date" className="mb-2 block text-sm">{translateText("Application closing date (optional)")}</Label>
                    <Input
                      id="admin-job-closing-date"
                      type="date"
                      value={job.closing_date ?? ""}
                      onChange={(e) => setJob({ ...job, closing_date: e.target.value })}
                      data-testid="admin-job-closing-date"
                    />
                    <p className="mt-1 text-xs text-slate-500">{translateText("After this date, the job automatically stops accepting applications.")}</p>
                  </div>
                  <div>
                    <Label className="mb-2 block text-sm">{translateText("Number of openings *")}</Label>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      placeholder={translateText("e.g. 10")}
                      value={job.openings || ""}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => {
                        const value = e.target.value;
                        setJob({ ...job, openings: value === "" ? 0 : Number(value) });
                      }}
                      onBlur={() => {
                        if (!Number.isInteger(job.openings) || job.openings < 1) {
                          setJob({ ...job, openings: 1 });
                        }
                      }}
                      data-testid="admin-job-openings"
                    />
                  </div>
                  <div>
                    <Label htmlFor="admin-job-description" className="mb-2 block text-sm">{translateText("Full job description *")}</Label>
                    <Textarea
                      id="admin-job-description"
                      rows={7}
                      placeholder={translateText("Responsibilities:\nQualifications and skills:\nWorking hours and shift:\nEducation and experience:\nWork location:")}
                      value={job.description ?? ""}
                      onChange={(e) => setJob({ ...job, description: e.target.value })}
                      data-testid="admin-job-description"
                    />
                    <p className="mt-1 text-xs text-slate-500">{translateText("Use verified job details. Existing jobs missing a description can be completed here; do not guess employer requirements.")}</p>
                  </div>
                  <div>
                    <Label htmlFor="admin-job-description-kn" className="mb-2 block text-sm">{translateText("Kannada job description (optional)")}</Label>
                    <Textarea
                      id="admin-job-description-kn"
                      rows={5}
                      placeholder="ಕನ್ನಡದಲ್ಲಿ ಉದ್ಯೋಗದ ವಿವರಗಳು"
                      value={job.description_kn ?? ""}
                      onChange={(e) => setJob({ ...job, description_kn: e.target.value })}
                      data-testid="admin-job-description-kn"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={createJob.isPending || editJob.isPending}
                    className="w-full bg-[#C2410C] text-white hover:bg-[#9A3412]"
                    data-testid="admin-job-submit"
                  >
                    <Plus className="mr-2 h-4 w-4" /> {translateText(editingJobId ? "Save Changes" : "Post Job")}
                  </Button>
                  {editingJobId && (
                    <Button type="button" variant="outline" className="w-full" onClick={() => {
                      setEditingJobId(null);
                      setJob({ title: "", location: "", skill_category: "Skilled", experience: "", salary: "", shift: "", openings: 1, description: "", description_kn: "", closing_date: "", employer_name: "" });
                    }}>{translateText("Cancel edit")}</Button>
                  )}
                </form>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white">
              <CardContent className="p-0">
                <Table data-testid="admin-jobs-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{translateText("Title")}</TableHead>
                      <TableHead>{translateText("Location")}</TableHead>
                      <TableHead>{translateText("Openings")}</TableHead>
                      <TableHead>{translateText("State")}</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(jobs.data ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center text-slate-500">{translateText("No jobs posted yet.")}</TableCell>
                      </TableRow>
                    )}
                    {(jobs.data ?? []).map((j) => (
                      <TableRow key={j.id} data-testid={`admin-job-row-${j.id}`}>
                        <TableCell className="font-medium text-[#0F2444]">{translateText(j.title)}{!(j.description ?? "").trim() && <span className="block text-xs font-normal text-amber-700">{translateText("Add job description")}</span>}</TableCell>
                        <TableCell>{translateText(j.location)}</TableCell>
                        <TableCell>{translateText(j.openings)}</TableCell>
                        <TableCell>
                          <Badge variant={j.active ? "default" : "secondary"}>
                            {translateText(j.active ? "Active" : "Inactive")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button size="xs" variant="outline" onClick={() => {
                              setEditingJobId(j.id);
                              setJob({ title: j.title, location: j.location, skill_category: j.skill_category, experience: j.experience ?? "", salary: j.salary ?? "", shift: j.shift ?? "", openings: j.openings, description: j.description ?? "", description_kn: j.description_kn ?? "", closing_date: j.closing_date ?? "", employer_name: j.employer_name ?? "" });
                            }} data-testid={`admin-job-edit-${j.id}`}>{translateText("Edit")}</Button>
                            <Link to={`/jobs/${j.id}`} target="_blank" className="inline-flex items-center rounded-md border border-slate-200 px-2.5 text-xs font-medium">{translateText("View")}</Link>
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => setMatchJobId(matchJobId === j.id ? null : j.id)}
                              data-testid={`admin-job-matches-${j.id}`}
                            >
                              {translateText(matchJobId === j.id ? "Hide" : "Alerts")}
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => toggleJob.mutate({ id: j.id, active: !j.active })}
                              data-testid={`admin-job-toggle-${j.id}`}
                            >
                              {translateText(j.active ? "Deactivate" : "Activate")}
                            </Button>
                            <Button
                              size="icon-xs"
                              variant="destructive"
                              onClick={() => removeJob.mutate(j.id)}
                              data-testid={`admin-job-delete-${j.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {matchJobId && (jobs.data ?? []).some((j) => j.id === matchJobId) && (
                  <div className="p-4 pt-0">
                    <JobMatches pin={pin} job={(jobs.data ?? []).find((j) => j.id === matchJobId)!} />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="email" className="mt-6">
            <EmailSettings pin={pin} />
          </TabsContent>

          <TabsContent value="invoices" className="mt-0">
            <Invoices />
          </TabsContent>
          <TabsContent value="expenses" className="mt-0"><Expenses /></TabsContent>
          <TabsContent value="profit-loss" className="mt-0"><ProfitLoss /></TabsContent>
          <TabsContent value="payroll" className="mt-0"><Payroll /></TabsContent>
          <TabsContent value="workforce" className="mt-6">
            <WorkforceManager pin={pin} />
          </TabsContent>

          <TabsContent value="clients" className="mt-6">
            <ClientsManager pin={pin} />
          </TabsContent>

          <TabsContent value="security" className="mt-6">
            <Security pin={pin} onPinChanged={onPinChanged} />
          </TabsContent>

          <TabsContent value="shortlists" className="mt-6">
            <Shortlists pin={pin} />
          </TabsContent>

          </div>
        </Tabs>
      </main>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  testid,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  testid: string;
}) {
  useSiteLanguage();
  return (
    <div className="w-full sm:w-auto sm:min-w-[150px]">
      <Label className="mb-1.5 block text-xs text-slate-500">{translateText(label)}</Label>
      <Select value={value || "__all"} onValueChange={(v: string) => onChange(v === "__all" ? "" : v)}>
        <SelectTrigger data-testid={testid}>
          <SelectValue>{translateText((v) => (v === "__all" || !v ? "All" : String(v)))}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">{translateText("All")}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {translateText(o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Funnel({
  icon: Icon,
  label,
  total,
  today,
  week,
  testid,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  total: number;
  today: number;
  week?: number;
  testid: string;
}) {
  useSiteLanguage();
  return (
    <div className="rounded-md border border-slate-200 bg-[#F8FAFC] p-4 sm:p-5" data-testid={testid}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#C2410C]" />
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{translateText(label)}</p>
      </div>
      <p className="mt-3 text-3xl font-bold text-[#0F2444]" data-testid={`${testid}-total`}>
        {translateText(total)}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        <span className="font-semibold text-[#C2410C]" data-testid={`${testid}-today`}>
          {translateText(today)}
        </span>{translateText(" ")}{translateText("today")}{week !== undefined && <> · {translateText(week)}{translateText(" in last 7 days")}</>}
      </p>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  testid,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  testid: string;
}) {
  useSiteLanguage();
  return (
    <Card className="border-slate-200 bg-white" data-testid={testid}>
      <CardContent className="flex items-center gap-3 p-4 sm:gap-4 sm:p-5">
        <div className="rounded-md bg-[#0F2444] p-3">
          <Icon className="h-5 w-5 text-[#FB923C]" />
        </div>
        <div>
          <p className="text-2xl font-bold text-[#0F2444]">{translateText(value)}</p>
          <p className="text-xs text-slate-500">{translateText(label)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

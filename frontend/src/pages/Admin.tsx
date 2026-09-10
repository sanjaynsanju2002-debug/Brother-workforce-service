import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Briefcase, Building2, Download, Eye, FileText, Loader2, Lock, MailWarning, MessageSquare, Plus, Trash2, TrendingUp, Users } from "lucide-react";
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
import Security from "@/components/site/Security";
import TrafficChart from "@/components/site/TrafficChart";
import Shortlists from "@/components/site/Shortlists";
import JobMatches from "@/components/site/JobMatches";
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
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { BRAND, SKILL_CATEGORIES } from "@/lib/brand";
import type { AdminStats, CompanyRequest, Job, JobCreate, Ok, Shortlist, TrafficStats, Worker, WorkerFilters } from "@/types";

const EMPTY_FILTERS = { skill_category: "", location: "", availability: "", status: "", q: "" };

const WORKER_STATUS = ["New", "Contacted", "Deployed", "Archived"];
const REQUEST_STATUS = ["Pending", "Quote Sent", "In Progress", "Closed"];




export default function Admin() {
  const [pin, setPin] = useState("");
  const [authPin, setAuthPin] = useState<string | null>(null);

  const login = useMutation({
    mutationFn: (p: string) => apiPost<Ok>(`/admin/login?pin=${encodeURIComponent(p)}`),
    onSuccess: (_d, p) => {
      setAuthPin(p);
      toast.success("Signed in");
    },
    onError: () => toast.error("Invalid PIN"),
  });

  if (!authPin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0F2444] px-6">
        <Card className="w-full max-w-sm border-slate-200 bg-white" data-testid="admin-login-card">
          <CardContent className="p-8">
            <img src={BRAND.logo} alt="" className="mx-auto mb-4 h-16 w-16 object-contain" />
            <h1 className="text-center text-xl font-bold text-[#0F2444]">Admin Access</h1>
            <p className="mt-1 text-center text-sm text-slate-500">Enter your security PIN to continue</p>
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                login.mutate(pin);
              }}
            >
              <div>
                <Label className="mb-2 block text-sm">Security PIN</Label>
                <Input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••••"
                  data-testid="admin-pin-input"
                />
              </div>
              <Button
                type="submit"
                disabled={login.isPending}
                className="w-full bg-[#EA580C] text-white hover:bg-[#C2410C]"
                data-testid="admin-pin-submit"
              >
                {login.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                Unlock Dashboard
              </Button>
            </form>
            <Link to="/" className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-[#0F2444]">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to website
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <Dashboard pin={authPin} onLogout={() => setAuthPin(null)} onPinChanged={setAuthPin} />;
}

function Dashboard({
  pin,
  onLogout,
  onPinChanged,
}: {
  pin: string;
  onLogout: () => void;
  onPinChanged: (p: string) => void;
}) {
  const qc = useQueryClient();
  const q = `?pin=${encodeURIComponent(pin)}`;
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [matchJobId, setMatchJobId] = useState<string | null>(null);

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
      toast.success(`Added to "${sl.name}"`);
    },
    onError: () => toast.error("Could not add to shortlist"),
  });

  const stats = useQuery({ queryKey: ["admin-stats", pin], queryFn: () => apiGet<AdminStats>(`/admin/stats${q}`) });
  const trafficQ = useQuery({
    queryKey: ["admin-traffic", pin],
    queryFn: () => apiGet<TrafficStats>(`/admin/traffic${q}`),
  });
  const workers = useQuery({
    queryKey: ["admin-workers", pin, filters],
    queryFn: () => {
      const p = new URLSearchParams({ pin });
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

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-stats", pin] });
    qc.invalidateQueries({ queryKey: ["admin-jobs", pin] });
    qc.invalidateQueries({ queryKey: ["jobs"] });
  };

  const workerStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) =>
      apiPatch<Worker>(`/admin/workers/${v.id}${q}`, { status: v.status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-workers", pin] });
      toast.success("Status updated");
    },
  });

  const requestStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) =>
      apiPatch<CompanyRequest>(`/admin/company-requests/${v.id}${q}`, { status: v.status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-requests", pin] });
      qc.invalidateQueries({ queryKey: ["admin-stats", pin] });
      toast.success("Status updated");
    },
  });

  const createJob = useMutation({
    mutationFn: (payload: JobCreate) => apiPost<Job>(`/admin/jobs${q}`, payload),
    onSuccess: () => {
      invalidate();
      toast.success("Job posted");
    },
    onError: () => toast.error("Could not post job"),
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
      toast.success("Job removed");
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
  });

  const s = stats.data;
  const t = trafficQ.data;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
          <img src={BRAND.logo} alt="" className="h-10 w-10 object-contain" />
          <div>
            <p className="font-[family-name:var(--font-heading)] text-sm font-bold text-[#0F2444]">
              ADMIN DASHBOARD
            </p>
            <p className="text-xs text-slate-500">Brothers Workforce Solutions</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Link to="/" className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:text-[#0F2444]">
              View Site
            </Link>
            <Button variant="outline" onClick={onLogout} data-testid="admin-logout">
              Lock
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="admin-stats">
          <Stat icon={Users} label="Worker Applications" value={s?.workers ?? 0} testid="stat-workers" />
          <Stat icon={FileText} label="Company Enquiries" value={s?.requests ?? 0} testid="stat-requests" />
          <Stat icon={FileText} label="Pending Enquiries" value={s?.open_requests ?? 0} testid="stat-open-requests" />
          <Stat icon={Briefcase} label="Active Jobs" value={s?.active_jobs ?? 0} testid="stat-active-jobs" />
        </div>

        {/* Website traffic + conversion funnel */}
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6" data-testid="admin-traffic">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[#0F2444]">
            <TrendingUp className="h-4 w-4 text-[#EA580C]" /> Website Activity
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Anonymous visit counts — one per visitor session. No personal data is tracked.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Funnel
              icon={Eye}
              label="People Visited"
              total={t?.visits_total ?? 0}
              today={t?.visits_today ?? 0}
              week={t?.visits_week}
              testid="funnel-visits"
            />
            <Funnel
              icon={Users}
              label="Applied for Jobs"
              total={t?.workers_total ?? 0}
              today={t?.workers_today ?? 0}
              testid="funnel-applications"
            />
            <Funnel
              icon={Building2}
              label="Requested Manpower"
              total={t?.requests_total ?? 0}
              today={t?.requests_today ?? 0}
              testid="funnel-requests"
            />
          </div>
        </div>

        {s && !s.email_configured && (
          <div
            className="mt-4 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4"
            data-testid="admin-email-warning"
          >
            <MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-900">
              <strong>Email alerts are not active yet.</strong> Submissions are still saved and shown here.
              Add your Resend API key as <code className="rounded bg-amber-100 px-1">RESEND_API_KEY</code> in
              the backend environment, then use the <strong>Email Settings</strong> tab to send a test.
            </div>
          </div>
        )}

        <TrafficChart pin={pin} />

        <Tabs defaultValue="workers" className="mt-8">
          <TabsList data-testid="admin-tabs">
            <TabsTrigger value="workers" data-testid="admin-tab-workers">
              Worker Applications
            </TabsTrigger>
            <TabsTrigger value="requests" data-testid="admin-tab-requests">
              Company Enquiries
            </TabsTrigger>
            <TabsTrigger value="jobs" data-testid="admin-tab-jobs">
              Job Postings
            </TabsTrigger>
            <TabsTrigger value="email" data-testid="admin-tab-email">
              Email Settings
            </TabsTrigger>
            <TabsTrigger value="clients" data-testid="admin-tab-clients">
              Clients
            </TabsTrigger>
            <TabsTrigger value="security" data-testid="admin-tab-security">
              Security
            </TabsTrigger>
            <TabsTrigger value="shortlists" data-testid="admin-tab-shortlists">
              Shortlists
            </TabsTrigger>
          </TabsList>

          <TabsContent value="workers" className="mt-6">
            <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4" data-testid="worker-filters">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[200px] flex-1">
                  <Label className="mb-1.5 block text-xs text-slate-500">Search name, phone or skill</Label>
                  <Input
                    placeholder="e.g. welder, 98765…"
                    value={filters.q}
                    onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                    data-testid="worker-filter-search"
                  />
                </div>
                <FilterSelect
                  label="Skill Category"
                  value={filters.skill_category}
                  options={filterOptions.data?.skill_categories ?? []}
                  onChange={(v) => setFilters({ ...filters, skill_category: v })}
                  testid="worker-filter-skill"
                />
                <FilterSelect
                  label="Location"
                  value={filters.location}
                  options={filterOptions.data?.locations ?? []}
                  onChange={(v) => setFilters({ ...filters, location: v })}
                  testid="worker-filter-location"
                />
                <FilterSelect
                  label="Availability"
                  value={filters.availability}
                  options={filterOptions.data?.availabilities ?? []}
                  onChange={(v) => setFilters({ ...filters, availability: v })}
                  testid="worker-filter-availability"
                />
                <FilterSelect
                  label="Status"
                  value={filters.status}
                  options={WORKER_STATUS}
                  onChange={(v) => setFilters({ ...filters, status: v })}
                  testid="worker-filter-status"
                />
                <Button
                  variant="outline"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                  data-testid="worker-filter-clear"
                >
                  Clear
                </Button>
              </div>
              <p className="mt-3 text-xs text-slate-500" data-testid="worker-filter-count">
                Showing {(workers.data ?? []).length} candidate
                {(workers.data ?? []).length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="mb-4 flex justify-end">
              <a
                href={`/api/admin/export/workers.csv${q}`}
                className="inline-flex items-center gap-2 rounded-md bg-[#0F2444] px-4 py-2 text-sm font-semibold text-white transition-transform duration-150 hover:bg-[#0A172C] active:scale-98"
                data-testid="admin-export-workers"
              >
                <Download className="h-4 w-4" /> Download Spreadsheet
              </a>
            </div>
            <Card className="border-slate-200 bg-white">
              <CardContent className="p-0">
                <Table data-testid="admin-workers-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Mobile</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Resume</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Contact</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(workers.data ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-slate-500">
                          No worker applications yet.
                        </TableCell>
                      </TableRow>
                    )}
                    {(workers.data ?? []).map((w) => (
                      <TableRow key={w.id} data-testid={`admin-worker-row-${w.id}`}>
                        <TableCell className="font-medium text-[#0F2444]">{w.full_name}</TableCell>
                        <TableCell>{w.mobile}</TableCell>
                        <TableCell>{w.skill_category}</TableCell>
                        <TableCell>{w.current_location}</TableCell>
                        <TableCell>
                          {w.resume_filename ? (
                            <a
                              href={`/api/workers/${w.id}/resume`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#EA580C] underline"
                            >
                              Download
                            </a>
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
                                  {st}
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
                              <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                            </a>
                            {(shortlists.data ?? []).length > 0 && (
                              <Select
                                value=""
                                onValueChange={(slId: string) =>
                                  addToShortlist.mutate({ slId, workerId: w.id })
                                }
                              >
                                <SelectTrigger size="sm" data-testid={`worker-shortlist-add-${w.id}`}>
                                  <SelectValue placeholder="Shortlist">{() => "Shortlist"}</SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {(shortlists.data ?? []).map((sl) => (
                                    <SelectItem key={sl.id} value={sl.id}>
                                      {sl.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requests" className="mt-6">
            <div className="mb-4 flex justify-end">
              <a
                href={`/api/admin/export/company-requests.csv${q}`}
                className="inline-flex items-center gap-2 rounded-md bg-[#0F2444] px-4 py-2 text-sm font-semibold text-white transition-transform duration-150 hover:bg-[#0A172C] active:scale-98"
                data-testid="admin-export-requests"
              >
                <Download className="h-4 w-4" /> Download Spreadsheet
              </a>
            </div>
            <Card className="border-slate-200 bg-white">
              <CardContent className="p-0">
                <Table data-testid="admin-requests-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Count</TableHead>
                      <TableHead>Industry</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Contact</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(requests.data ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-slate-500">
                          No company enquiries yet.
                        </TableCell>
                      </TableRow>
                    )}
                    {(requests.data ?? []).map((r) => (
                      <TableRow key={r.id} data-testid={`admin-request-row-${r.id}`}>
                        <TableCell className="font-medium text-[#0F2444]">{r.company_name}</TableCell>
                        <TableCell>
                          {r.contact_person}
                          <span className="block text-xs text-slate-500">{r.mobile}</span>
                        </TableCell>
                        <TableCell>{r.job_role}</TableCell>
                        <TableCell>{r.worker_count}</TableCell>
                        <TableCell>{r.industry}</TableCell>
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
                                  {st}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <a
                            href={waLink(r.mobile, companyMessage(r.company_name, r.job_role, r.worker_count))}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md bg-[#16A34A] px-2.5 py-1.5 text-xs font-semibold text-white transition-transform duration-150 hover:bg-[#15803D] active:scale-98"
                            data-testid={`admin-request-whatsapp-${r.id}`}
                          >
                            <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                          </a>
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
              <CardContent className="p-6">
                <h3 className="mb-4 text-lg font-semibold text-[#0F2444]">Post a New Job</h3>
                <form
                  className="space-y-3"
                  data-testid="admin-job-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!job.title || !job.location) {
                      toast.error("Title and location are required");
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
                        }),
                    });
                  }}
                >
                  <Input
                    placeholder="Job title *"
                    value={job.title}
                    onChange={(e) => setJob({ ...job, title: e.target.value })}
                    data-testid="admin-job-title"
                  />
                  <Input
                    placeholder="Location *"
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
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Experience required"
                    value={job.experience ?? ""}
                    onChange={(e) => setJob({ ...job, experience: e.target.value })}
                    data-testid="admin-job-experience"
                  />
                  <Input
                    placeholder="Salary (optional)"
                    value={job.salary ?? ""}
                    onChange={(e) => setJob({ ...job, salary: e.target.value })}
                    data-testid="admin-job-salary"
                  />
                  <Input
                    placeholder="Shift"
                    value={job.shift ?? ""}
                    onChange={(e) => setJob({ ...job, shift: e.target.value })}
                    data-testid="admin-job-shift"
                  />
                  <Input
                    type="number"
                    min={1}
                    placeholder="Openings"
                    value={job.openings}
                    onChange={(e) => setJob({ ...job, openings: Number(e.target.value) || 1 })}
                    data-testid="admin-job-openings"
                  />
                  <Textarea
                    rows={3}
                    placeholder="Description"
                    value={job.description ?? ""}
                    onChange={(e) => setJob({ ...job, description: e.target.value })}
                    data-testid="admin-job-description"
                  />
                  <Button
                    type="submit"
                    disabled={createJob.isPending}
                    className="w-full bg-[#EA580C] text-white hover:bg-[#C2410C]"
                    data-testid="admin-job-submit"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Post Job
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white">
              <CardContent className="p-0">
                <Table data-testid="admin-jobs-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Openings</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(jobs.data ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center text-slate-500">
                          No jobs posted yet.
                        </TableCell>
                      </TableRow>
                    )}
                    {(jobs.data ?? []).map((j) => (
                      <TableRow key={j.id} data-testid={`admin-job-row-${j.id}`}>
                        <TableCell className="font-medium text-[#0F2444]">{j.title}</TableCell>
                        <TableCell>{j.location}</TableCell>
                        <TableCell>{j.openings}</TableCell>
                        <TableCell>
                          <Badge variant={j.active ? "default" : "secondary"}>
                            {j.active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="flex gap-2">
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => setMatchJobId(matchJobId === j.id ? null : j.id)}
                            data-testid={`admin-job-matches-${j.id}`}
                          >
                            {matchJobId === j.id ? "Hide" : "Alerts"}
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => toggleJob.mutate({ id: j.id, active: !j.active })}
                            data-testid={`admin-job-toggle-${j.id}`}
                          >
                            {j.active ? "Deactivate" : "Activate"}
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="destructive"
                            onClick={() => removeJob.mutate(j.id)}
                            data-testid={`admin-job-delete-${j.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
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

          <TabsContent value="clients" className="mt-6">
            <ClientsManager pin={pin} />
          </TabsContent>

          <TabsContent value="security" className="mt-6">
            <Security pin={pin} onPinChanged={onPinChanged} />
          </TabsContent>

          <TabsContent value="shortlists" className="mt-6">
            <Shortlists pin={pin} />
          </TabsContent>
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
  return (
    <div className="min-w-[150px]">
      <Label className="mb-1.5 block text-xs text-slate-500">{label}</Label>
      <Select value={value || "__all"} onValueChange={(v: string) => onChange(v === "__all" ? "" : v)}>
        <SelectTrigger data-testid={testid}>
          <SelectValue>{(v) => (v === "__all" || !v ? "All" : String(v))}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">All</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
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
  return (
    <div className="rounded-md border border-slate-200 bg-[#F8FAFC] p-5" data-testid={testid}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#EA580C]" />
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</p>
      </div>
      <p className="mt-3 text-3xl font-bold text-[#0F2444]" data-testid={`${testid}-total`}>
        {total}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        <span className="font-semibold text-[#EA580C]" data-testid={`${testid}-today`}>
          {today}
        </span>{" "}
        today
        {week !== undefined && <> · {week} in last 7 days</>}
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
  return (
    <Card className="border-slate-200 bg-white" data-testid={testid}>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="rounded-md bg-[#0F2444] p-3">
          <Icon className="h-5 w-5 text-[#FB923C]" />
        </div>
        <div>
          <p className="text-2xl font-bold text-[#0F2444]">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  Lock,
  LogOut,
  RefreshCw,
  Save,
  Search,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiGet, apiPost, apiPut, attendanceFetch, clearAttendanceToken, setAttendanceToken } from "@/attendance/api";
import { BRAND } from "@/lib/brand";
import { indiaToday, monthLabel } from "@/lib/finance";

const OPS = "/admin/operations";
const WEBSITE = "https://brothersworkforcesolutions.in";
const SHIFTS = ["All", "General", "Morning", "Afternoon", "Night"] as const;
type ShiftName = Exclude<(typeof SHIFTS)[number], "All">;
type ShiftFilter = (typeof SHIFTS)[number];
type AttendanceStatus =
  | "Unmarked"
  | "Present"
  | "Absent"
  | "Half-day"
  | "Paid leave"
  | "Unpaid leave"
  | "Leave"
  | "Holiday"
  | "Weekly off";

const STATUS_OPTIONS: { value: Exclude<AttendanceStatus, "Leave">; label: string; short: string; tone: string }[] = [
  { value: "Unmarked", label: "Not marked", short: "—", tone: "bg-slate-100 text-slate-600" },
  { value: "Present", label: "Present", short: "P", tone: "bg-emerald-100 text-emerald-800" },
  { value: "Absent", label: "Absent", short: "A", tone: "bg-red-100 text-red-800" },
  { value: "Half-day", label: "Half day", short: "HD", tone: "bg-amber-100 text-amber-800" },
  { value: "Paid leave", label: "Paid leave", short: "PL", tone: "bg-sky-100 text-sky-800" },
  { value: "Unpaid leave", label: "Unpaid leave", short: "UL", tone: "bg-violet-100 text-violet-800" },
  { value: "Holiday", label: "Government holiday", short: "H", tone: "bg-orange-100 text-orange-800" },
  { value: "Weekly off", label: "Weekly off", short: "WO", tone: "bg-indigo-100 text-indigo-800" },
];

type Company = { id: string; name: string; archived?: boolean };
type Employee = {
  id: string;
  assignment_id?: string;
  full_name: string;
  employee_id?: string | null;
  role?: string | null;
  shift?: ShiftName;
};
type AttendanceRow = {
  assignment_id: string;
  full_name: string;
  employee_id?: string | null;
  role: string;
  shift: ShiftName;
  status: AttendanceStatus;
  overtime_hours: string;
};
type AttendanceSheet = {
  id: string;
  company_id: string;
  company_name: string;
  attendance_date: string;
  revision: number;
  rows: AttendanceRow[];
  notes: string;
  status: "Draft" | "Approved";
  approved_by?: string | null;
  approved_at?: string | null;
};
type AttendanceDraft = { company_name: string; employees: Employee[]; sheet: AttendanceSheet | null };
type AttendanceRegister = {
  company_id: string;
  company_name: string;
  month: string;
  employees: (Omit<Employee, "id"> & { assignment_id: string })[];
  sheets: AttendanceSheet[];
};
type Account = { ok: boolean; name: string; role: string };
type AttendanceLogin = { ok: boolean; token: string; expires_in: number };
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function message(error: unknown) {
  if (error instanceof ApiError) {
    const detail = (error.body as { detail?: string | { msg?: string }[] } | null)?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail[0]?.msg || "Check the entered details.";
    if (error.status === 401) return "Your session expired. Sign in again.";
  }
  return "The request could not be completed. Please try again.";
}

function normalizeStatus(status: AttendanceStatus): Exclude<AttendanceStatus, "Leave"> {
  return status === "Leave" ? "Unpaid leave" : status;
}

function statusInfo(status: AttendanceStatus) {
  return STATUS_OPTIONS.find((item) => item.value === normalizeStatus(status)) ?? STATUS_OPTIONS[0];
}

async function downloadAttendance(path: string, fallback: string) {
  const response = await attendanceFetch(path);
  if (!response.ok) throw new ApiError(response.status, await response.json().catch(() => null));
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? fallback;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export default function AttendanceApp() {
  useEffect(() => {
    const oldTitle = document.title;
    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const oldRobots = robots?.content;
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const oldManifest = manifest?.href;
    document.title = "Attendance Tracker | Brothers Workforce Solutions";
    if (robots) robots.content = "noindex, nofollow, noarchive";
    if (manifest) manifest.href = "/manifest.webmanifest";
    return () => {
      document.title = oldTitle;
      if (robots && oldRobots) robots.content = oldRobots;
      if (manifest && oldManifest) manifest.href = oldManifest;
    };
  }, []);
  return <AttendanceSession />;
}

function InstallAppButton({ className = "" }: { className?: string }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(() => window.matchMedia("(display-mode: standalone)").matches);

  useEffect(() => {
    const available = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const complete = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", complete);
    return () => {
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", complete);
    };
  }, []);

  if (installed) return null;
  return <Button type="button" variant="outline" className={className} onClick={async () => {
    if (!prompt) {
      toast.info("Open your browser menu and choose ‘Add to Home screen’ to install this app.");
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") toast.success("Attendance app installed");
    setPrompt(null);
  }}><Download className="h-4 w-4" />Install app</Button>;
}

function AttendanceSession() {
  const queryClient = useQueryClient();
  const [pin, setPin] = useState("");
  const [loggedOut, setLoggedOut] = useState(false);
  useEffect(() => {
    const expired = () => setLoggedOut(true);
    window.addEventListener("attendance-session-expired", expired);
    return () => window.removeEventListener("attendance-session-expired", expired);
  }, []);
  const session = useQuery({ queryKey: ["attendance-account"], queryFn: () => apiGet<Account>("/admin/me"), retry: false });
  const login = useMutation({
    mutationFn: () => apiPost<AttendanceLogin>("/admin/attendance-login", { pin }),
    onSuccess: async (data) => {
      setAttendanceToken(data.token);
      setPin("");
      setLoggedOut(false);
      await session.refetch();
      toast.success("Attendance app unlocked");
    },
    onError: (error) => toast.error(error instanceof ApiError && error.status === 429 ? "Too many attempts. Try again in 15 minutes." : "Invalid PIN"),
  });

  if (session.isPending && !loggedOut) {
    return <div className="flex min-h-screen items-center justify-center bg-[#071A33] text-white"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  }
  if (loggedOut || !session.isSuccess) {
    return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#071A33] px-5 py-12">
      <div className="pointer-events-none absolute -top-32 -right-24 h-80 w-80 rounded-full bg-orange-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />
      <Card className="relative w-full max-w-md overflow-hidden border-white/10 bg-white shadow-2xl">
        <div className="h-1.5 bg-gradient-to-r from-[#F97316] via-[#EA580C] to-[#0F2444]" />
        <CardContent className="p-7 sm:p-9">
          <img src={BRAND.logo} alt="Brothers Workforce Solutions" className="mx-auto h-20 w-20 object-contain" />
          <h1 className="mt-5 text-center text-2xl font-bold text-[#0F2444]">Attendance Tracker</h1>
          <p className="mx-auto mt-2 max-w-xs text-center text-sm leading-6 text-slate-500">Private workforce attendance connected to your live Company Workforce and Payroll records.</p>
          <form className="mt-7 space-y-4" onSubmit={(event) => { event.preventDefault(); login.mutate(); }}>
            <div><Label htmlFor="attendance-pin" className="mb-2 block">Owner security PIN</Label><Input id="attendance-pin" type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(event) => setPin(event.target.value)} placeholder="Enter your dashboard PIN" autoFocus /></div>
            <Button type="submit" disabled={!pin || login.isPending} className="h-11 w-full bg-[#EA580C] text-white hover:bg-[#C2410C]">{login.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}Open attendance</Button>
          </form>
          <InstallAppButton className="mt-3 w-full" />
          <a href={WEBSITE} className="mt-6 block text-center text-xs text-slate-500 hover:text-[#0F2444]">Open business website</a>
        </CardContent>
      </Card>
    </main>;
  }

  return <AttendanceWorkspace account={session.data} onLogout={async () => {
    try { await apiPost("/admin/logout"); } finally {
      clearAttendanceToken();
      queryClient.clear();
      setLoggedOut(true);
    }
  }} />;
}

function AttendanceWorkspace({ account, onLogout }: { account: Account; onLogout: () => void }) {
  const [view, setView] = useState<"daily" | "register">("daily");
  const [companyId, setCompanyId] = useState(() => localStorage.getItem("bws-attendance-company") ?? "");
  const [day, setDay] = useState(indiaToday());
  const [month, setMonth] = useState(indiaToday().slice(0, 7));
  const companies = useQuery({ queryKey: ["attendance-companies"], queryFn: () => apiGet<Company[]>(`${OPS}/attendance-companies`) });
  const selected = companies.data?.find((company) => company.id === companyId);

  useEffect(() => {
    if (companyId) localStorage.setItem("bws-attendance-company", companyId);
    else localStorage.removeItem("bws-attendance-company");
  }, [companyId]);
  useEffect(() => {
    if (companies.data && companyId && !companies.data.some((company) => company.id === companyId)) setCompanyId("");
  }, [companies.data, companyId]);

  return <div className="min-h-screen bg-[#F3F6FA] text-[#0F2444]">
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-3 sm:px-6">
        <img src={BRAND.logo} alt="" className="h-10 w-10 shrink-0 object-contain" />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold sm:text-base">Brothers Workforce Solutions</p><p className="text-xs text-slate-500">Private attendance tracker</p></div>
        <InstallAppButton className="hidden sm:inline-flex" />
        <a href={`${WEBSITE}/admin?tab=workforce`} className="hidden min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium hover:bg-slate-50 lg:flex">Website dashboard<ExternalLink className="h-3.5 w-3.5" /></a>
        <Button type="button" variant="outline" size="sm" onClick={onLogout}><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sign out</span></Button>
      </div>
    </header>

    <main className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 sm:py-7">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EA580C]">Welcome, {account.name}</p><h1 className="mt-1 text-2xl font-bold sm:text-3xl">Workforce attendance</h1><p className="mt-1 text-sm text-slate-500">Select a company to load its current employees directly from Company Workforce.</p></div>
        {companyId && <Button type="button" variant="outline" onClick={() => setCompanyId("")}><Building2 className="h-4 w-4" />Change company</Button>}
      </div>

      {!companyId ? <CompanyChooser companies={companies.data ?? []} pending={companies.isPending} error={companies.isError} onChoose={setCompanyId} /> : <>
        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-50 text-[#EA580C]"><Building2 className="h-5 w-5" /></span><div className="min-w-0"><p className="text-xs text-slate-500">Selected company</p><h2 className="truncate text-lg font-semibold">{selected?.name ?? "Loading company…"}</h2></div></div>
            <div className="inline-flex rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => setView("daily")} className={`flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition ${view === "daily" ? "bg-white text-[#0F2444] shadow-sm" : "text-slate-500"}`}><ClipboardCheck className="h-4 w-4" />Daily</button><button type="button" onClick={() => setView("register")} className={`flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition ${view === "register" ? "bg-white text-[#0F2444] shadow-sm" : "text-slate-500"}`}><BarChart3 className="h-4 w-4" />Monthly</button></div>
          </div>
        </section>
        {view === "daily" ? <DailyAttendance companyId={companyId} day={day} onDay={setDay} /> : <MonthlyRegister companyId={companyId} month={month} onMonth={setMonth} />}
      </>}
    </main>
  </div>;
}

function CompanyChooser({ companies, pending, error, onChoose }: { companies: Company[]; pending: boolean; error: boolean; onChoose: (id: string) => void }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-orange-50 text-[#EA580C]"><Building2 className="h-5 w-5" /></span><div><h2 className="text-lg font-semibold">Choose a company or factory</h2><p className="text-sm text-slate-500">Employees assigned to that company will appear automatically.</p></div></div>
    {pending && <p className="mt-6 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading your companies…</p>}
    {error && <p className="mt-6 text-sm text-red-700">Companies could not be loaded. Refresh and try again.</p>}
    {!pending && !error && !companies.length && <div className="mt-6 rounded-xl border border-dashed p-6 text-center"><p className="text-sm text-slate-600">No active companies are available.</p><a href={`${WEBSITE}/admin?tab=workforce`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#EA580C]">Add a company in Company Workforce<ChevronRight className="h-4 w-4" /></a></div>}
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{companies.map((company) => <button key={company.id} type="button" onClick={() => onChoose(company.id)} className="group flex min-h-24 items-center gap-4 rounded-xl border border-slate-200 p-4 text-left transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#0F2444] text-white"><Building2 className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{company.name}</span><span className="mt-1 block text-xs text-slate-500">Open employee attendance</span></span><ChevronRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-[#EA580C]" /></button>)}</div>
  </section>;
}

function DailyAttendance({ companyId, day, onDay }: { companyId: string; day: string; onDay: (day: string) => void }) {
  const query = useQuery({ queryKey: ["attendance-daily", companyId, day], queryFn: () => apiGet<AttendanceDraft>(`${OPS}/attendance?company_id=${encodeURIComponent(companyId)}&attendance_date=${day}`), refetchOnWindowFocus: false });
  return <section className="space-y-4">
    <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,18rem)_1fr] sm:p-5">
      <div><Label htmlFor="attendance-day" className="mb-2 flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#EA580C]" />Attendance date</Label><DateInput id="attendance-day" value={day} onValueChange={(value) => value ? onDay(value) : false} /></div>
      <div className="flex items-end"><p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600"><strong>Payroll rule:</strong> Present, paid leave, government holiday and weekly off count as 1 payable day. Half day counts as 0.5. Absent and unpaid leave count as 0.</p></div>
    </div>
    {query.isPending ? <LoadingCard label="Loading employees from Company Workforce…" /> : query.isError ? <ErrorCard text={message(query.error)} retry={() => query.refetch()} /> : query.data && <DailyEditor key={`${companyId}:${day}:${query.data.sheet?.revision ?? 0}:${query.dataUpdatedAt}`} companyId={companyId} day={day} draft={query.data} reload={() => query.refetch()} />}
  </section>;
}

function DailyEditor({ companyId, day, draft, reload }: { companyId: string; day: string; draft: AttendanceDraft; reload: () => Promise<unknown> }) {
  const queryClient = useQueryClient();
  const existing = draft.sheet;
  const saved = new Map(existing?.rows.map((row) => [row.assignment_id, row]));
  const initialRows = existing?.status === "Approved" ? existing.rows : draft.employees.map((employee): AttendanceRow => {
    const old = saved.get(employee.id);
    return {
      assignment_id: employee.id,
      full_name: employee.full_name,
      employee_id: employee.employee_id,
      role: employee.role ?? "",
      shift: old?.shift ?? employee.shift ?? "General",
      status: normalizeStatus(old?.status ?? "Unmarked"),
      overtime_hours: old?.overtime_hours ?? "0",
    };
  });
  const [rows, setRows] = useState(initialRows);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [dirty, setDirty] = useState(false);
  const [shift, setShift] = useState<ShiftFilter>("All");
  const [search, setSearch] = useState("");
  const [problem, setProblem] = useState("");
  const locked = existing?.status === "Approved";

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const visible = useMemo(() => rows.filter((row) => {
    const words = `${row.full_name} ${row.employee_id ?? ""} ${row.role}`.toLocaleLowerCase();
    return (shift === "All" || row.shift === shift) && words.includes(search.trim().toLocaleLowerCase());
  }), [rows, shift, search]);
  const counts = Object.fromEntries(STATUS_OPTIONS.map((item) => [item.value, rows.filter((row) => normalizeStatus(row.status) === item.value).length])) as Record<string, number>;
  const marked = rows.length - (counts.Unmarked ?? 0);

  const touch = () => { setDirty(true); setProblem(""); };
  const edit = (id: string, changes: Partial<AttendanceRow>) => {
    setRows((items) => items.map((row) => row.assignment_id === id ? { ...row, ...changes } : row));
    touch();
  };
  const bulk = (status: Exclude<AttendanceStatus, "Leave">) => {
    const ids = new Set(visible.map((row) => row.assignment_id));
    setRows((items) => items.map((row) => ids.has(row.assignment_id) ? { ...row, status, ...(status === "Present" || status === "Half-day" ? {} : { overtime_hours: "0" }) } : row));
    touch();
  };
  const save = useMutation({
    mutationFn: () => apiPut<AttendanceSheet>(`${OPS}/attendance`, {
      company_id: companyId,
      attendance_date: day,
      revision: existing?.revision ?? null,
      notes,
      rows: rows.map(({ assignment_id, status, shift: rowShift, overtime_hours }) => ({ assignment_id, status: normalizeStatus(status), shift: rowShift, overtime_hours: overtime_hours || "0" })),
    }),
    onSuccess: async () => {
      setDirty(false);
      toast.success("Attendance draft saved");
      await queryClient.invalidateQueries({ queryKey: ["attendance-register", companyId] });
      await reload();
    },
    onError: (error) => setProblem(message(error)),
  });
  const action = useMutation({
    mutationFn: (name: "approve" | "reopen") => apiPost<AttendanceSheet>(`${OPS}/attendance/${existing!.id}/${name}`, { revision: existing!.revision }),
    onSuccess: async (_, name) => {
      setDirty(false);
      toast.success(name === "approve" ? "Attendance approved and ready for payroll" : "Attendance reopened for correction");
      await queryClient.invalidateQueries({ queryKey: ["attendance-register", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["payroll-draft", companyId] });
      await reload();
    },
    onError: (error) => setProblem(message(error)),
  });
  const busy = save.isPending || action.isPending;

  if (!rows.length) return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><Users className="mx-auto h-8 w-8 text-slate-300" /><h3 className="mt-3 font-semibold">No employees for this date</h3><p className="mt-1 text-sm text-slate-500">Add employees or review their joining and leaving dates in Company Workforce.</p><a href={`${WEBSITE}/admin?tab=workforce`} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#EA580C]">Open Company Workforce<ExternalLink className="h-4 w-4" /></a></div>;

  return <>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">{STATUS_OPTIONS.slice(1).map((item) => <div key={item.value} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><div className={`inline-flex min-w-7 justify-center rounded-md px-2 py-1 text-xs font-bold ${item.tone}`}>{item.short}</div><p className="mt-2 text-xl font-bold tabular-nums">{counts[item.value] ?? 0}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{item.label}</p></div>)}</div>

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{draft.company_name}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${locked ? "bg-emerald-100 text-emerald-800" : existing ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{locked ? "Approved" : existing ? "Draft" : "New"}</span></div><p className="mt-1 text-sm text-slate-500">{marked} of {rows.length} employees marked{locked && existing?.approved_by ? ` · Approved by ${existing.approved_by}` : ""}</p></div><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { if (!dirty || window.confirm("Discard unsaved changes and reload the workforce?")) void reload(); }}><RefreshCw className="h-4 w-4" />Reload employees</Button></div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">{SHIFTS.map((item) => <button key={item} type="button" onClick={() => setShift(item)} className={`min-h-9 shrink-0 rounded-lg px-3 text-sm font-medium ${shift === item ? "bg-[#0F2444] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{item}{item !== "All" ? ` (${rows.filter((row) => row.shift === item).length})` : ` (${rows.length})`}</button>)}</div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative"><Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee, ID or role" /></div>
          {!locked && <div className="flex flex-wrap gap-2"><span className="self-center text-xs font-medium text-slate-500">Mark {visible.length} visible:</span>{(["Present", "Absent", "Holiday", "Weekly off"] as const).map((status) => <Button key={status} type="button" variant="outline" size="sm" disabled={busy || !visible.length} onClick={() => bulk(status)}>{status}</Button>)}</div>}
        </div>
      </div>

      {problem && <div role="alert" className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:m-5">{problem}</div>}
      {!visible.length ? <p className="p-8 text-center text-sm text-slate-500">No employees match this shift or search.</p> : <div className="divide-y divide-slate-100">{visible.map((row) => <EmployeeAttendanceCard key={row.assignment_id} row={row} locked={locked || busy} onEdit={(changes) => edit(row.assignment_id, changes)} />)}</div>}

      <div className="border-t border-slate-200 bg-slate-50/70 p-4 sm:p-5">
        <Label htmlFor="attendance-notes" className="mb-2 block">Day notes</Label><Textarea id="attendance-notes" value={notes} maxLength={1000} disabled={locked || busy} onChange={(event) => { setNotes(event.target.value); touch(); }} placeholder="Holiday name, shift changes, absence reasons or other notes (optional)" />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Save a draft first. Approval locks the day and makes its payable days available to Payroll.</p><div className="flex flex-wrap gap-2">{locked ? <Button type="button" variant="outline" disabled={busy} onClick={() => { if (window.confirm("Reopen this approved attendance for correction? Payroll must be re-imported after changes.")) action.mutate("reopen"); }}>Reopen for correction</Button> : <><Button type="button" disabled={busy || (!dirty && !!existing)} onClick={() => save.mutate()} className="bg-[#EA580C] text-white hover:bg-[#C2410C]">{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save draft</Button>{existing && <Button type="button" disabled={busy || dirty || marked !== rows.length || day > indiaToday()} onClick={() => { if (window.confirm("Approve this complete day and send its totals to payroll?")) action.mutate("approve"); }}><CheckCircle2 className="h-4 w-4" />Approve day</Button>}</>}</div></div>
      </div>
    </section>
  </>;
}

function EmployeeAttendanceCard({ row, locked, onEdit }: { row: AttendanceRow; locked: boolean; onEdit: (changes: Partial<AttendanceRow>) => void }) {
  const info = statusInfo(row.status);
  return <article className="p-4 sm:p-5">
    <div className="grid gap-4 xl:grid-cols-[minmax(220px,1fr)_170px_220px_140px] xl:items-end">
      <div className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-bold ${info.tone}`}>{info.short}</span><div className="min-w-0"><h3 className="truncate font-semibold">{row.full_name}</h3><p className="mt-1 truncate text-xs text-slate-500">{row.employee_id || "No employee ID"}{row.role ? ` · ${row.role}` : ""}</p></div></div>
      <div><Label htmlFor={`shift-${row.assignment_id}`} className="mb-1.5 block text-xs text-slate-500">Shift</Label><select id={`shift-${row.assignment_id}`} disabled={locked} value={row.shift} onChange={(event) => onEdit({ shift: event.target.value as ShiftName })} className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-50">{SHIFTS.slice(1).map((item) => <option key={item}>{item}</option>)}</select></div>
      <div><Label htmlFor={`status-${row.assignment_id}`} className="mb-1.5 block text-xs text-slate-500">Attendance</Label><select id={`status-${row.assignment_id}`} aria-label={`Attendance for ${row.full_name}`} disabled={locked} value={normalizeStatus(row.status)} onChange={(event) => { const status = event.target.value as Exclude<AttendanceStatus, "Leave">; onEdit({ status, ...(status === "Present" || status === "Half-day" ? {} : { overtime_hours: "0" }) }); }} className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium disabled:bg-slate-50">{STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
      <div><Label htmlFor={`overtime-${row.assignment_id}`} className="mb-1.5 block text-xs text-slate-500">Overtime hours</Label><Input id={`overtime-${row.assignment_id}`} aria-label={`Overtime hours for ${row.full_name}`} type="number" inputMode="decimal" min="0" max="24" step="0.01" disabled={locked || !["Present", "Half-day"].includes(normalizeStatus(row.status))} value={row.overtime_hours} onChange={(event) => onEdit({ overtime_hours: event.target.value })} /></div>
    </div>
  </article>;
}

function MonthlyRegister({ companyId, month, onMonth }: { companyId: string; month: string; onMonth: (month: string) => void }) {
  const [downloading, setDownloading] = useState<"pdf" | "xlsx" | null>(null);
  const query = useQuery({ queryKey: ["attendance-register", companyId, month], queryFn: () => apiGet<AttendanceRegister>(`${OPS}/attendance-register?company_id=${encodeURIComponent(companyId)}&month=${month}`) });
  if (query.isPending) return <LoadingCard label="Preparing monthly register…" />;
  if (query.isError) return <ErrorCard text={message(query.error)} retry={() => query.refetch()} />;
  const data = query.data;
  const sheets = data.sheets;
  const dates = sheets.map((sheet) => sheet.attendance_date);
  const approved = sheets.filter((sheet) => sheet.status === "Approved");
  const byDate = new Map(sheets.map((sheet) => [sheet.attendance_date, new Map(sheet.rows.map((row) => [row.assignment_id, row]))]));
  const totals = new Map<string, Record<string, number>>();
  for (const employee of data.employees) {
    const counts: Record<string, number> = {};
    for (const sheet of approved) {
      const status = normalizeStatus(sheet.rows.find((row) => row.assignment_id === employee.assignment_id)?.status ?? "Unmarked");
      counts[status] = (counts[status] ?? 0) + 1;
    }
    totals.set(employee.assignment_id, counts);
  }
  const download = async (format: "pdf" | "xlsx") => {
    try {
      setDownloading(format);
      await downloadAttendance(`${OPS}/attendance-register/download/${format}?company_id=${encodeURIComponent(companyId)}&month=${month}`, `BWS-Attendance-${month}.${format}`);
    } catch (error) {
      toast.error(message(error));
    } finally {
      setDownloading(null);
    }
  };
  return <section className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div><Label htmlFor="attendance-month" className="mb-2 flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#EA580C]" />Register month</Label><DateInput id="attendance-month" type="month" value={month} onValueChange={(value) => value ? onMonth(value) : false} /></div><div className="flex flex-wrap gap-3 text-sm"><Metric label="Saved days" value={String(sheets.length)} /><Metric label="Approved" value={String(approved.length)} /><Metric label="Employees" value={String(data.employees.length)} /></div></div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4 sm:p-5"><div><h2 className="text-lg font-semibold">{data.company_name} · {monthLabel(month)}</h2><p className="mt-1 text-sm text-slate-500">Only approved days are included in payroll totals. Draft days are marked below.</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={!!downloading} onClick={() => void download("pdf")}><Download className="h-4 w-4" />{downloading === "pdf" ? "Preparing…" : "PDF"}</Button><Button type="button" variant="outline" disabled={!!downloading} onClick={() => void download("xlsx")}><FileSpreadsheet className="h-4 w-4" />{downloading === "xlsx" ? "Preparing…" : "Excel"}</Button><Button type="button" variant="outline" onClick={() => window.print()}>Print</Button><a href={`${WEBSITE}/admin?tab=payroll`} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-[#0F2444] px-3 text-sm font-medium text-white hover:bg-[#183A67]">Open Payroll<ExternalLink className="h-3.5 w-3.5" /></a></div></div>
      {!sheets.length ? <div className="p-10 text-center"><CalendarDays className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-medium">No attendance saved for this month</p><p className="mt-1 text-sm text-slate-500">Open Daily attendance and save the first date.</p></div> : <div className="overflow-x-auto"><table className="min-w-max text-left text-xs"><thead className="sticky top-0 bg-slate-50"><tr><th className="sticky left-0 z-10 min-w-56 border-r border-b bg-slate-50 p-3">Employee</th>{dates.map((date) => <th key={date} className="min-w-14 border-r border-b p-2 text-center"><span className="block text-slate-500">{date.slice(8)}</span><span className={`mt-1 block text-[9px] ${sheets.find((sheet) => sheet.attendance_date === date)?.status === "Approved" ? "text-emerald-700" : "text-amber-700"}`}>{sheets.find((sheet) => sheet.attendance_date === date)?.status === "Approved" ? "OK" : "Draft"}</span></th>)}<th className="min-w-48 border-b p-3">Approved totals</th></tr></thead><tbody>{data.employees.map((employee) => <tr key={employee.assignment_id} className="border-b"><th className="sticky left-0 z-[1] border-r bg-white p-3"><span className="block max-w-52 truncate font-semibold">{employee.full_name}</span><span className="mt-1 block font-normal text-slate-500">{employee.employee_id || employee.role || "—"}</span></th>{dates.map((date) => { const row = byDate.get(date)?.get(employee.assignment_id); const info = statusInfo(row?.status ?? "Unmarked"); return <td key={date} className="border-r p-2 text-center"><span title={`${info.label}${row?.shift ? ` · ${row.shift}` : ""}`} className={`inline-flex min-w-8 justify-center rounded-md px-1.5 py-1 font-bold ${info.tone}`}>{info.short}</span></td>; })}<td className="p-3"><div className="flex max-w-48 flex-wrap gap-1">{STATUS_OPTIONS.slice(1).map((item) => (totals.get(employee.assignment_id)?.[item.value] ?? 0) > 0 ? <span key={item.value} className={`rounded px-1.5 py-1 ${item.tone}`}>{item.short} {totals.get(employee.assignment_id)?.[item.value]}</span> : null)}</div></td></tr>)}</tbody></table></div>}
      <div className="border-t bg-slate-50 p-4 text-xs text-slate-500"><div className="flex flex-wrap gap-x-4 gap-y-2">{STATUS_OPTIONS.slice(1).map((item) => <span key={item.value}><strong>{item.short}</strong> {item.label}</span>)}</div></div>
    </section>
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-24 rounded-xl bg-slate-50 px-4 py-2"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>;
}

function LoadingCard({ label }: { label: string }) {
  return <div className="flex min-h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500 shadow-sm"><Loader2 className="mr-2 h-5 w-5 animate-spin" />{label}</div>;
}

function ErrorCard({ text, retry }: { text: string; retry: () => unknown }) {
  return <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm"><p className="text-sm text-red-700">{text}</p><Button type="button" variant="outline" className="mt-4" onClick={retry}>Try again</Button></div>;
}

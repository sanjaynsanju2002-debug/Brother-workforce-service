import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/attendance/api";
import {
  clearEmployeeAttendanceToken,
  employeeGet,
  employeePost,
  hasEmployeeAttendanceToken,
  setEmployeeAttendanceToken,
} from "@/attendance/employeeApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRAND } from "@/lib/brand";

const SHIFTS = ["General", "Morning", "Afternoon", "Night"] as const;
type ShiftName = (typeof SHIFTS)[number];
type AttendanceState = "not_checked_in" | "checked_in" | "completed";

type AttendanceItem = {
  attendance_date: string;
  state: AttendanceState;
  status: string;
  shift: ShiftName | null;
  check_in_at: string | null;
  check_out_at: string | null;
  payroll_ready: boolean;
};

type EmployeeDashboard = {
  employee: {
    assignment_id: string;
    employee_id: string;
    full_name: string;
    company_name: string;
    role: string;
    assigned_shift: ShiftName;
  };
  server_date: string;
  today: AttendanceItem;
  recent: AttendanceItem[];
};

type EmployeeLogin = { ok: boolean; token: string; expires_in: number };
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function apiMessage(error: unknown) {
  if (error instanceof ApiError) {
    const detail = (error.body as { detail?: string | { msg?: string }[] } | null)?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail[0]?.msg || "Check the entered details.";
  }
  return "The request could not be completed. Please try again.";
}

function dateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function timeLabel(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(new Date(value));
}

export function InstallAppButton({ className = "" }: { className?: string }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [installed, setInstalled] = useState(() => window.matchMedia("(display-mode: standalone)").matches);
  const userAgent = navigator.userAgent;
  const android = /Android/i.test(userAgent);
  const ios = /iPad|iPhone|iPod/i.test(userAgent);
  const chromeIntent = `intent://${window.location.host}${window.location.pathname}${window.location.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(window.location.href)};end`;

  useEffect(() => {
    const available = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const complete = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", complete);
    return () => {
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", complete);
    };
  }, []);

  if (installed) return null;
  const install = async () => {
    if (!prompt) {
      setGuideOpen(true);
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") toast.success("Attendance app installed");
    else setGuideOpen(true);
    setPrompt(null);
  };
  return <>
    <Button type="button" variant="outline" className={className} onClick={() => void install()} data-testid="install-attendance-app"><Download className="h-4 w-4" />Install app</Button>
    {guideOpen && <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setGuideOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="install-guide-title" className="w-full max-w-md rounded-2xl bg-white p-6 text-left text-[#0F2444] shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#EA580C]">Private attendance app</p><h2 id="install-guide-title" className="mt-1 text-xl font-bold">Install on this device</h2></div><Button type="button" size="icon" variant="ghost" aria-label="Close install instructions" onClick={() => setGuideOpen(false)}><X className="h-4 w-4" /></Button></div>
        <p className="mt-3 text-sm leading-6 text-slate-600">This installs directly from the private link and adds the attendance app to your home screen. It does not download a separate APK file.</p>
        {android ? <div className="mt-5 space-y-3 text-sm leading-6 text-slate-700">
          <p><strong>Android:</strong> open the app in Chrome, then tap <strong>Install app</strong>. If Chrome does not show the prompt, tap the three-dot menu and choose <strong>Add to Home screen</strong>.</p>
          <a href={chromeIntent} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#EA580C] px-4 py-2 font-semibold text-white hover:bg-[#C2410C]">Open in Chrome <ExternalLink className="h-4 w-4" /></a>
        </div> : ios ? <div className="mt-5 rounded-xl bg-sky-50 p-4 text-sm leading-6 text-slate-700"><strong>iPhone or iPad:</strong> open this link in Safari, tap the Share button, then choose <strong>Add to Home Screen</strong>.</div> : <div className="mt-5 rounded-xl bg-sky-50 p-4 text-sm leading-6 text-slate-700"><strong>Computer:</strong> open this page in Chrome or Microsoft Edge. Use the install icon in the address bar, or open the browser menu and choose <strong>Install Brothers Workforce Attendance</strong>.</div>}
        <p className="mt-4 text-xs leading-5 text-slate-500">If you opened the link inside ChatGPT, WhatsApp, Instagram, or Facebook, first choose “Open in browser”. In-app browsers usually cannot install web apps.</p>
      </section>
    </div>}
  </>;
}

export default function EmployeeAttendanceApp({ onOwner }: { onOwner: () => void }) {
  const queryClient = useQueryClient();
  const [signedIn, setSignedIn] = useState(hasEmployeeAttendanceToken);
  const [employeeId, setEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [shift, setShift] = useState<ShiftName>("General");

  useEffect(() => {
    const expired = () => setSignedIn(false);
    window.addEventListener("employee-attendance-session-expired", expired);
    return () => window.removeEventListener("employee-attendance-session-expired", expired);
  }, []);

  const dashboard = useQuery({
    queryKey: ["employee-attendance-dashboard"],
    queryFn: () => employeeGet<EmployeeDashboard>("/employee-attendance/me"),
    enabled: signedIn,
    retry: false,
  });

  useEffect(() => {
    if (dashboard.data?.employee.assigned_shift && dashboard.data.today.state === "not_checked_in") {
      setShift(dashboard.data.employee.assigned_shift);
    }
  }, [dashboard.data?.employee.assigned_shift, dashboard.data?.today.state]);

  const login = useMutation({
    mutationFn: () => employeePost<EmployeeLogin>("/employee-attendance/login", { employee_id: employeeId, pin }),
    onSuccess: async (data) => {
      setEmployeeAttendanceToken(data.token);
      setPin("");
      setSignedIn(true);
      await dashboard.refetch();
      toast.success("Signed in to attendance");
    },
    onError: (error) => toast.error(apiMessage(error)),
  });

  const action = useMutation({
    mutationFn: (name: "check-in" | "check-out") => employeePost<EmployeeDashboard>(
      `/employee-attendance/${name}`,
      name === "check-in" ? { shift } : undefined,
    ),
    onSuccess: (data, name) => {
      queryClient.setQueryData(["employee-attendance-dashboard"], data);
      toast.success(name === "check-in" ? "Check-in recorded" : "Check-out recorded and ready for payroll");
    },
    onError: (error) => toast.error(apiMessage(error)),
  });

  if (!signedIn) {
    return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#071A33] px-5 py-10">
      <div className="pointer-events-none absolute -top-32 -right-24 h-80 w-80 rounded-full bg-orange-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />
      <Card className="relative w-full max-w-md overflow-hidden border-white/10 bg-white shadow-2xl">
        <div className="h-1.5 bg-gradient-to-r from-[#F97316] via-[#EA580C] to-[#0F2444]" />
        <CardContent className="p-7 sm:p-9">
          <img src={BRAND.logo} alt="Brothers Workforce Solutions" className="mx-auto h-20 w-20 object-contain" />
          <p className="mt-5 text-center text-xs font-bold uppercase tracking-[0.18em] text-[#EA580C]">Employee portal</p>
          <h1 className="mt-2 text-center text-2xl font-bold text-[#0F2444]">Mark your attendance</h1>
          <p className="mx-auto mt-2 max-w-xs text-center text-sm leading-6 text-slate-500">Use the employee ID and personal PIN given by your manager.</p>
          <form className="mt-7 space-y-4" onSubmit={(event) => { event.preventDefault(); login.mutate(); }}>
            <div><Label htmlFor="employee-id" className="mb-2 block">Employee ID</Label><Input id="employee-id" autoComplete="username" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} placeholder="For example, EMP-101" autoFocus /></div>
            <div><Label htmlFor="employee-pin" className="mb-2 block">Personal PIN</Label><Input id="employee-pin" type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit PIN" /></div>
            <Button type="submit" disabled={!employeeId.trim() || pin.length !== 6 || login.isPending} className="h-11 w-full bg-[#EA580C] text-white hover:bg-[#C2410C]">{login.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}Sign in</Button>
          </form>
          <div className="mt-3 grid gap-2 sm:grid-cols-2"><InstallAppButton className="w-full" /><Button type="button" variant="ghost" onClick={onOwner} className="w-full"><ShieldCheck className="h-4 w-4" />Owner dashboard</Button></div>
          <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-slate-500"><KeyRound className="h-3.5 w-3.5" />Ask your manager to reset a forgotten PIN.</p>
        </CardContent>
      </Card>
    </main>;
  }

  if (dashboard.isPending) {
    return <div className="flex min-h-screen items-center justify-center bg-[#071A33] text-white"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  }
  if (dashboard.isError || !dashboard.data) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-100 p-5"><Card className="w-full max-w-md"><CardContent className="p-7 text-center"><p className="text-sm text-red-700">{apiMessage(dashboard.error)}</p><Button className="mt-4" onClick={() => dashboard.refetch()}>Try again</Button><Button variant="ghost" className="mt-2 w-full" onClick={() => { clearEmployeeAttendanceToken(); setSignedIn(false); }}>Return to sign in</Button></CardContent></Card></main>;
  }

  const data = dashboard.data;
  const current = data.today;
  const signOut = async () => {
    try { await employeePost("/employee-attendance/logout"); } catch { /* Clear the device session even if the network is unavailable. */ }
    clearEmployeeAttendanceToken();
    queryClient.removeQueries({ queryKey: ["employee-attendance-dashboard"] });
    setSignedIn(false);
  };

  return <div className="min-h-screen bg-[#F3F6FA] text-[#0F2444]">
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
        <img src={BRAND.logo} alt="" className="h-10 w-10 shrink-0 object-contain" />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold sm:text-base">Brothers Workforce Solutions</p><p className="text-xs text-slate-500">Employee attendance</p></div>
        <InstallAppButton className="hidden sm:inline-flex" />
        <Button type="button" variant="outline" size="sm" onClick={() => void signOut()}><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sign out</span></Button>
      </div>
    </header>

    <main className="mx-auto max-w-5xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
      <section className="overflow-hidden rounded-2xl bg-[#0F2444] text-white shadow-lg">
        <div className="grid gap-5 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:p-7">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10"><UserRound className="h-7 w-7 text-orange-300" /></span>
          <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-300">Welcome</p><h1 className="mt-1 truncate text-2xl font-bold">{data.employee.full_name}</h1><p className="mt-1 text-sm text-slate-300">{data.employee.employee_id}{data.employee.role ? ` · ${data.employee.role}` : ""}</p></div>
          <div className="rounded-xl bg-white/10 px-4 py-3"><p className="flex items-center gap-2 text-xs text-slate-300"><Building2 className="h-4 w-4" />Company / factory</p><p className="mt-1 font-semibold">{data.employee.company_name}</p></div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,.65fr)]">
        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <div className={`h-1.5 ${current.state === "completed" ? "bg-emerald-500" : current.state === "checked_in" ? "bg-sky-500" : "bg-[#EA580C]"}`} />
          <CardContent className="p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#EA580C]">Today’s attendance</p><h2 className="mt-1 text-xl font-bold">{dateLabel(current.attendance_date)}</h2></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${current.state === "completed" ? "bg-emerald-100 text-emerald-800" : current.state === "checked_in" ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600"}`}>{current.state === "completed" ? "Completed" : current.state === "checked_in" ? "Checked in" : "Not checked in"}</span></div>

            {current.state === "not_checked_in" && <div className="mt-7">
              <Label htmlFor="employee-shift" className="mb-2 block">Select today’s shift</Label>
              <select id="employee-shift" value={shift} onChange={(event) => setShift(event.target.value as ShiftName)} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base font-medium sm:max-w-sm">{SHIFTS.map((item) => <option key={item}>{item}</option>)}</select>
              <Button type="button" disabled={action.isPending} onClick={() => action.mutate("check-in")} className="mt-5 h-12 w-full bg-[#EA580C] text-base text-white hover:bg-[#C2410C] sm:max-w-sm">{action.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}Check in now</Button>
            </div>}

            {current.state === "checked_in" && <div className="mt-7">
              <div className="grid gap-3 sm:grid-cols-2"><TimeBox label="Checked in" value={timeLabel(current.check_in_at)} /><TimeBox label="Shift" value={current.shift || data.employee.assigned_shift} /></div>
              <Button type="button" disabled={action.isPending} onClick={() => action.mutate("check-out")} className="mt-5 h-12 w-full bg-[#0F2444] text-base text-white hover:bg-[#183A67] sm:max-w-sm">{action.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Clock3 className="h-5 w-5" />}Check out now</Button>
            </div>}

            {current.state === "completed" && <div className="mt-7">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="flex items-center gap-2 font-semibold text-emerald-800"><BadgeCheck className="h-5 w-5" />Attendance completed</p><p className="mt-1 text-sm leading-6 text-emerald-700">Your attendance is approved automatically and is now ready for payroll.</p></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3"><TimeBox label="Check in" value={timeLabel(current.check_in_at)} /><TimeBox label="Check out" value={timeLabel(current.check_out_at)} /><TimeBox label="Shift" value={current.shift || "—"} /></div>
            </div>}

            <p className="mt-6 flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />Check-in and check-out times are recorded automatically by the server. You cannot change the date or recorded time.</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm"><CardContent className="p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-50 text-[#EA580C]"><CalendarDays className="h-5 w-5" /></span><div><h2 className="font-semibold">How it works</h2><p className="text-xs text-slate-500">Three simple steps</p></div></div><ol className="mt-5 space-y-4 text-sm text-slate-600"><li className="flex gap-3"><Step value="1" /><span>Select your shift and check in when you reach the office.</span></li><li className="flex gap-3"><Step value="2" /><span>Check out once when your work is finished, including after midnight for a night shift.</span></li><li className="flex gap-3"><Step value="3" /><span>Your completed attendance becomes payroll-ready automatically.</span></li></ol></CardContent></Card>
      </section>

      <Card className="overflow-hidden border-slate-200 shadow-sm"><div className="flex items-center justify-between border-b px-5 py-4 sm:px-6"><div><h2 className="font-semibold">Recent attendance</h2><p className="mt-0.5 text-xs text-slate-500">Your last 14 days of recorded activity</p></div><CheckCircle2 className="h-5 w-5 text-emerald-600" /></div><CardContent className="p-0">{data.recent.length ? <div className="divide-y divide-slate-100">{data.recent.map((item) => <div key={`${item.attendance_date}:${item.check_in_at ?? "manual"}`} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:px-6"><div><p className="font-medium">{dateLabel(item.attendance_date)}</p><p className="mt-1 text-xs text-slate-500">{item.shift || "General"} shift · {item.status}</p></div><p className="text-sm tabular-nums text-slate-600">{timeLabel(item.check_in_at)} – {timeLabel(item.check_out_at)}</p><span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${item.payroll_ready ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"}`}>{item.payroll_ready ? "Payroll-ready" : "In progress"}</span></div>)}</div> : <div className="p-8 text-center text-sm text-slate-500">No recent attendance yet.</div>}</CardContent></Card>

      <div className="flex justify-center"><Button type="button" variant="ghost" onClick={onOwner}><ShieldCheck className="h-4 w-4" />Open owner dashboard</Button></div>
    </main>
  </div>;
}

function TimeBox({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 font-bold tabular-nums text-[#0F2444]">{value}</p></div>;
}

function Step({ value }: { value: string }) {
  return <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#0F2444] text-xs font-bold text-white">{value}</span>;
}

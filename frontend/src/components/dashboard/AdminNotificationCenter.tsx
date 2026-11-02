import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Banknote,
  Bell,
  Building2,
  CalendarClock,
  ClipboardCheck,
  Eye,
  ReceiptIndianRupee,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { apiGet } from "@/lib/api";
import { rupees } from "@/lib/finance";
import { OPS } from "@/lib/operations";
import type { AdminStats, TrafficStats } from "@/types";

type Reminder = { id: string; kind: string; title: string; date: string; tab: string };
type Overview = {
  date: string;
  outstanding: string;
  overdue: string;
  salary_payable: string;
  salary_paid: string;
  salary_balance: string;
  unmarked: number;
  draft_sheets: number;
  reminders: Reminder[];
};
type NotificationKind = "applications" | "visits" | "enquiries" | "invoices" | "salary" | "attendance" | "reminders";
type NotificationItem = {
  id: NotificationKind;
  title: string;
  detail: string;
  signature: string;
  active: boolean;
  tab: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "blue" | "orange" | "red" | "green";
};

const storagePrefix = "bws-admin-notifications";

function readSeen(key: string) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, string> : {};
  } catch {
    return {};
  }
}

function saveSeen(key: string, value: Record<string, string>) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* The bell still works when storage is blocked. */ }
}

const plural = (count: number, singular: string, multiple = `${singular}s`) => `${count} ${count === 1 ? singular : multiple}`;

export default function AdminNotificationCenter({ onNavigate, accountKey = "owner" }: { onNavigate: (tab: string) => void; accountKey?: string }) {
  const [open, setOpen] = useState(false);
  const storageKey = `${storagePrefix}:${accountKey}`;
  const [seen, setSeen] = useState<Record<string, string>>(() => readSeen(storageKey));
  useEffect(() => setSeen(readSeen(storageKey)), [storageKey]);

  const traffic = useQuery({
    queryKey: ["admin-traffic", "session"],
    queryFn: () => apiGet<TrafficStats>("/admin/traffic"),
    refetchInterval: 60_000,
  });
  const stats = useQuery({
    queryKey: ["admin-stats", "session"],
    queryFn: () => apiGet<AdminStats>("/admin/stats"),
    refetchInterval: 60_000,
  });
  const overview = useQuery({
    queryKey: ["ops", "overview"],
    queryFn: () => apiGet<Overview>(`${OPS}/overview`),
    refetchInterval: 60_000,
  });

  const items = useMemo<NotificationItem[]>(() => {
    const t = traffic.data;
    const s = stats.data;
    const o = overview.data;
    if (!t || !s || !o) return [];
    const outstanding = Number(o.outstanding);
    const overdue = Number(o.overdue);
    const salaryBalance = Number(o.salary_balance);
    const attention = o.unmarked + o.draft_sheets;
    const reminderSignature = o.reminders.map((item) => `${item.id}:${item.date}`).join("|");
    return [
      {
        id: "applications", icon: UserPlus, tone: "blue", tab: "workers",
        title: plural(t.workers_today, "worker application") + " today",
        detail: `${plural(t.workers_total, "application")} received in total`,
        signature: String(t.workers_total), active: t.workers_total > 0,
      },
      {
        id: "visits", icon: Eye, tone: "blue", tab: "overview",
        title: plural(t.visits_today, "website visitor") + " today",
        detail: `${t.visits_week} in the last 7 days · ${t.visits_total} total visits`,
        signature: String(t.visits_total), active: t.visits_total > 0,
      },
      {
        id: "enquiries", icon: Building2, tone: s.open_requests > 0 ? "orange" : "green", tab: "requests",
        title: plural(t.requests_today, "company enquiry", "company enquiries") + " today",
        detail: `${s.open_requests} pending · ${t.requests_total} received in total`,
        signature: `${t.requests_total}:${s.open_requests}`, active: t.requests_total > 0 || s.open_requests > 0,
      },
      {
        id: "invoices", icon: ReceiptIndianRupee, tone: overdue > 0 ? "red" : outstanding > 0 ? "orange" : "green", tab: "invoices",
        title: outstanding > 0 ? `${rupees(o.outstanding)} client invoice balance` : "No pending invoice balance",
        detail: overdue > 0 ? `${rupees(o.overdue)} is overdue and needs follow-up` : "No overdue invoice amount",
        signature: `${o.outstanding}:${o.overdue}`, active: outstanding > 0,
      },
      {
        id: "salary", icon: Banknote, tone: salaryBalance > 0 ? "orange" : "green", tab: "salary-payments",
        title: salaryBalance > 0 ? `${rupees(o.salary_balance)} salary balance` : "Salary payments are clear",
        detail: `${rupees(o.salary_paid)} paid of ${rupees(o.salary_payable)} payable this month`,
        signature: `${o.date.slice(0, 7)}:${o.salary_payable}:${o.salary_paid}:${o.salary_balance}`, active: salaryBalance > 0,
      },
      {
        id: "attendance", icon: ClipboardCheck, tone: attention > 0 ? "orange" : "green", tab: "attendance",
        title: attention > 0 ? `${attention} attendance items need review` : "Today's attendance is up to date",
        detail: `${o.unmarked} employees unmarked · ${o.draft_sheets} draft attendance sheets`,
        signature: `${o.date}:${o.unmarked}:${o.draft_sheets}`, active: attention > 0,
      },
      {
        id: "reminders", icon: CalendarClock, tone: o.reminders.length > 0 ? "orange" : "green", tab: o.reminders[0]?.tab || "documents",
        title: o.reminders.length > 0 ? plural(o.reminders.length, "follow-up or reminder", "follow-ups or reminders") : "No due follow-ups",
        detail: o.reminders[0] ? `Next: ${o.reminders[0].title}` : "Nothing needs immediate follow-up",
        signature: reminderSignature || "clear", active: o.reminders.length > 0,
      },
    ];
  }, [overview.data, stats.data, traffic.data]);

  const unread = items.filter((item) => item.active && seen[item.id] !== item.signature);
  const loading = traffic.isPending || stats.isPending || overview.isPending;
  const failed = traffic.isError || stats.isError || overview.isError;

  const recordSeen = (item?: NotificationItem) => {
    const next = item
      ? { ...seen, [item.id]: item.signature }
      : Object.fromEntries(items.map((entry) => [entry.id, entry.signature]));
    setSeen(next);
    saveSeen(storageKey, next);
  };
  const visit = (item: NotificationItem) => {
    recordSeen(item);
    setOpen(false);
    onNavigate(item.tab);
  };
  const refresh = () => {
    void Promise.all([traffic.refetch(), stats.refetch(), overview.refetch()]);
  };

  return <>
    <Button
      type="button"
      variant="outline"
      size="icon-lg"
      className="relative"
      onClick={() => setOpen(true)}
      aria-label={`Notifications${unread.length ? `, ${unread.length} unread` : ""}`}
      data-testid="admin-notification-bell"
    >
      <Bell className="h-4.5 w-4.5" />
      {unread.length > 0 && <span className="absolute -right-1.5 -top-1.5 grid min-h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background" data-testid="admin-notification-count">{unread.length > 9 ? "9+" : unread.length}</span>}
    </Button>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full gap-0 overflow-hidden sm:max-w-md" data-testid="admin-notification-panel">
        <SheetHeader className="border-b px-5 py-5 pr-12">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle className="text-lg font-bold text-foreground">Notifications</SheetTitle>
              <SheetDescription className="mt-1">Live business updates, refreshed every minute.</SheetDescription>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" onClick={refresh} aria-label="Refresh notifications" disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /></Button>
          </div>
          {items.length > 0 && <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">{unread.length ? plural(unread.length, "unread update") : "You're all caught up"}</p>
            {unread.length > 0 && <Button type="button" variant="link" size="sm" className="h-auto px-0 text-xs" onClick={() => recordSeen()} data-testid="admin-notification-read-all">Mark all as read</Button>}
          </div>}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto bg-muted/40 p-3 sm:p-4">
          {loading && !items.length && <div className="space-y-3" aria-label="Loading notifications">{[0, 1, 2, 3].map((key) => <div key={key} className="h-24 animate-pulse rounded-xl border bg-card" />)}</div>}
          {failed && !items.length && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">Notifications could not be loaded.</p><Button type="button" variant="outline" size="sm" className="mt-3" onClick={refresh}>Try again</Button></div>}
          <div className="space-y-2.5">
            {items.map((item) => {
              const Icon = item.icon;
              const isUnread = item.active && seen[item.id] !== item.signature;
              const tone = item.tone === "red" ? "border-red-200 bg-red-50 text-red-700" : item.tone === "orange" ? "border-orange-200 bg-orange-50 text-orange-700" : item.tone === "green" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-sky-200 bg-sky-50 text-sky-700";
              return <button
                type="button"
                key={item.id}
                onClick={() => visit(item)}
                className={`relative flex w-full gap-3 rounded-xl border bg-card p-4 text-left text-card-foreground shadow-sm transition hover:-translate-y-px hover:border-orange-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-orange-600 ${isUnread ? "border-l-4 border-l-orange-500" : ""}`}
                data-testid={`admin-notification-${item.id}`}
              >
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border ${tone}`}><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">{item.title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.detail}</span></span>
                {isUnread && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-orange-500" aria-label="Unread" />}
              </button>;
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  </>;
}

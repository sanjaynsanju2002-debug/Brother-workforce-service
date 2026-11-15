import { useState, type ReactNode } from "react";
import { ChevronRight, Menu } from "lucide-react";
import { adminGroups, allowedTab } from "@/lib/adminNavigation";

export function AdminNavigation({ role, activeTab, onNavigate }: {
  role: string | undefined;
  activeTab: string;
  onNavigate: (tab: string) => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  return <aside className="min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto" aria-label="Admin sections">
    <button type="button" className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 font-semibold text-[#0F2444] lg:hidden"
      onClick={() => setMobileOpen((open) => !open)} aria-expanded={mobileOpen} aria-controls="admin-sidebar-menu" data-testid="admin-sidebar-toggle">
      Dashboard menu <Menu className="h-5 w-5" aria-hidden="true" />
    </button>
    <div id="admin-sidebar-menu" className={`${mobileOpen ? "block" : "hidden"} mt-2 lg:mt-0 lg:block`}>
      <p className="mb-2 hidden px-3 text-xs font-bold uppercase tracking-widest text-slate-500 lg:block">Dashboard</p>
      <nav aria-label="Dashboard menu" className="space-y-1 rounded-xl border border-slate-200 bg-white p-2 shadow-sm" data-testid="admin-sidebar">
        {adminGroups.map((group) => {
          const tabs = group.tabs.filter(([key]) => allowedTab(role, key));
          if (!tabs.length) return null;
          const expanded = expandedGroup === group.label;
          const containsActive = tabs.some(([key]) => key === activeTab);
          const id = `admin-group-${group.label.toLowerCase().replaceAll(" ", "-")}`;
          return <div key={group.label}>
            <h2><button type="button" id={`${id}-heading`} aria-expanded={expanded} aria-controls={id}
              className={`flex min-h-12 w-full items-center justify-between gap-2 rounded-lg px-3 py-3 text-left text-xs font-bold uppercase tracking-wide hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 ${containsActive ? "text-[#C2410C]" : "text-slate-600"}`}
              onClick={() => setExpandedGroup(expanded ? null : group.label)} data-testid={`${id}-toggle`}>
              {group.label}<ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden="true" />
            </button></h2>
            <div id={id} hidden={!expanded} aria-labelledby={`${id}-heading`} className="pb-2 pl-2">
              {tabs.map(([key, label]) => <button key={key} type="button" id={`admin-tab-${key}`} aria-controls={`admin-panel-${key}`} aria-current={activeTab === key ? "page" : undefined}
                className={`my-0.5 min-h-10 w-full rounded-md border px-3 py-2 text-left text-sm font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 ${activeTab === key ? "border-slate-300 bg-slate-100 text-[#0F2444]" : "border-transparent text-slate-600"}`}
                onClick={() => { onNavigate(key); setMobileOpen(false); }} data-testid={`admin-tab-${key}`}>
                {label}
              </button>)}
            </div>
          </div>;
        })}
      </nav>
    </div>
  </aside>;
}

/** Navigation switches sections without mounting the inactive editors. */
export function AdminSection({ activeTab, value, className = "", children }: {
  activeTab: string;
  value: string;
  className?: string;
  children: ReactNode;
}) {
  if (activeTab !== value) return null;
  const label = adminGroups.flatMap((group) => group.tabs).find(([key]) => key === value)?.[1] ?? value;
  return <section id={`admin-panel-${value}`} aria-label={label} tabIndex={0} className={`flex-1 text-sm outline-none ${className}`}>{children}</section>;
}

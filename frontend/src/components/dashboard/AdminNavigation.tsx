import { useState, type ReactNode } from "react";
import { BriefcaseBusiness, ChevronRight, LayoutDashboard, Menu, Settings2, UsersRound, WalletCards } from "lucide-react";
import { adminGroups, allowedTab } from "@/lib/adminNavigation";
import "./admin-navigation.css";

const groupIcons = [LayoutDashboard, BriefcaseBusiness, UsersRound, WalletCards, Settings2];

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
      <nav aria-label="Dashboard menu" className="admin-navigation" data-testid="admin-sidebar">
        {adminGroups.map((group, index) => {
          const Icon = groupIcons[index];
          const tabs = group.tabs.filter(([key]) => allowedTab(role, key));
          if (!tabs.length) return null;
          const expanded = expandedGroup === group.label;
          const containsActive = tabs.some(([key]) => key === activeTab);
          const id = `admin-group-${group.label.toLowerCase().replaceAll(" ", "-")}`;
          return <div key={group.label} className="admin-nav-group" data-open={expanded} data-current={containsActive}>
            <h2><button type="button" id={`${id}-heading`} aria-expanded={expanded} aria-controls={id}
              className="admin-nav-heading"
              onClick={() => setExpandedGroup(expanded ? null : group.label)} data-testid={`${id}-toggle`}>
              <span className="admin-nav-icon"><Icon size={18} strokeWidth={1.8} aria-hidden="true" /></span>
              <span className="admin-nav-title">{group.label}</span><ChevronRight className="admin-nav-chevron" size={16} aria-hidden="true" />
            </button></h2>
            <div id={id} aria-hidden={!expanded} inert={!expanded} aria-labelledby={`${id}-heading`} className="admin-nav-panel">
              <div className="admin-nav-panel-inner"><div className="admin-nav-list">
              {tabs.map(([key, label]) => <button key={key} type="button" id={`admin-tab-${key}`} aria-controls={`admin-panel-${key}`} aria-current={activeTab === key ? "page" : undefined}
                className="admin-nav-item"
                onClick={() => { onNavigate(key); setMobileOpen(false); }} data-testid={`admin-tab-${key}`}>
                {label}
              </button>)}
              </div></div>
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

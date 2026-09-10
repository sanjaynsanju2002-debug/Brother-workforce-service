import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, Phone, ShieldCheck, X, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

const LINKS = [
  { label: "Home", href: "#home" },
  { label: "About", href: "#about" },
  { label: "Services", href: "#services" },
  { label: "Industries", href: "#industries" },
  { label: "Compliance", href: "#compliance" },
  { label: "Jobs", href: "#jobs" },
  { label: "For Workers", href: "#worker-registration" },
  { label: "For Companies", href: "#manpower-request" },
  { label: "Contact", href: "#contact" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);

  const go = (href: string) => {
    setOpen(false);
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <header
      className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-md"
      data-testid="main-navbar"
    >
      <div className="hidden bg-[#0F2444] text-slate-200 md:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2 text-xs">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-orange-400" />
            Licensed Labour Contractor &nbsp;·&nbsp; GST {BRAND.gst}
          </span>
          <a
            href={`tel:${BRAND.phoneRaw}`}
            className="inline-flex items-center gap-2 transition-colors hover:text-orange-400"
            data-testid="nav-contact-phone"
          >
            <Phone className="h-3.5 w-3.5" /> {BRAND.phone}
          </a>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-3" data-testid="brand-logo-link">
          <img src={BRAND.logo} alt="Brothers Workforce Solutions logo" className="h-11 w-11 object-contain" />
          <span className="hidden leading-tight sm:block">
            <span className="block font-[family-name:var(--font-heading)] text-sm font-bold tracking-tight text-[#0F2444]">
              BROTHERS <span className="text-[#EA580C]">WORKFORCE</span>
            </span>
            <span className="block text-[10px] uppercase tracking-[0.18em] text-slate-500">Solutions</span>
          </span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 xl:flex">
          {LINKS.map((l) => (
            <button
              key={l.href}
              onClick={() => go(l.href)}
              data-testid={`nav-link-${l.href.slice(1)}`}
              className="rounded px-2.5 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:text-[#EA580C]"
            >
              {l.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 xl:ml-2">
          <Button
            className="hidden bg-[#EA580C] text-white transition-transform duration-150 hover:bg-[#C2410C] active:scale-98 sm:inline-flex"
            onClick={() => go("#manpower-request")}
            data-testid="nav-btn-hire-workforce"
          >
            Find Workers
          </Button>
          <Button
            variant="outline"
            className="hidden border-[#0F2444] text-[#0F2444] transition-transform duration-150 hover:bg-[#0F2444] hover:text-white active:scale-98 sm:inline-flex"
            onClick={() => go("#worker-registration")}
            data-testid="nav-btn-find-jobs"
          >
            Find Jobs
          </Button>
          <Link
            to="/admin"
            className="rounded border border-slate-200 p-2 text-slate-500 transition-colors hover:text-[#0F2444]"
            aria-label="Admin access"
            data-testid="nav-btn-admin-access"
          >
            <Lock className="h-4 w-4" />
          </Link>
          <button
            className="rounded p-2 text-[#0F2444] xl:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            data-testid="nav-mobile-toggle"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div className={cn("border-t border-slate-200 bg-white xl:hidden", open ? "block" : "hidden")}>
        <nav className="mx-auto grid max-w-7xl gap-1 px-4 py-3">
          {LINKS.map((l) => (
            <button
              key={l.href}
              onClick={() => go(l.href)}
              data-testid={`nav-mobile-link-${l.href.slice(1)}`}
              className="rounded px-2 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {l.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

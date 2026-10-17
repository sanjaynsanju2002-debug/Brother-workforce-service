import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import Home from "@/pages/Home";
import Admin from "@/pages/Admin";
import Privacy from "@/pages/Privacy";
import JobDetail from "@/pages/JobDetail";
import LanguageSelector from "@/components/site/LanguageSelector";
import CompanyForm from "@/components/site/CompanyForm";
import WorkforceManager from "@/components/site/WorkforceManager";
import TalentBank from "@/components/site/TalentBank";
import Payroll from "@/components/site/Payroll";
import Invoices from "@/components/site/Invoices";
import Expenses from "@/components/site/Expenses";
import ProfitLoss from "@/components/site/ProfitLoss";
import { candidateCopy } from "@/lib/candidateLanguage";
import { kannada } from "@/lib/kannada";
import { getBusinessAnswer } from "@/lib/businessChat";
import { indiaToday, monthLabel } from "@/lib/finance";
import { getSiteLanguage, setSiteLanguage, translateText, LANGUAGE_STORAGE_KEY } from "@/lib/language";

afterEach(() => { setSiteLanguage("en"); vi.unstubAllGlobals(); });

function render(element: ReactElement, data: Array<[unknown[], unknown]> = [], location = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  for (const [key, value] of data) client.setQueryData(key, value);
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: [location] }, element)));
  client.clear();
  return html;
}

describe("shared website language", () => {
  it("starts in English and keeps both language choices available", () => {
    expect(getSiteLanguage()).toBe("en");
    const html = render(createElement(LanguageSelector));
    expect(html).toContain('value="en" lang="en" selected=""');
    expect(html).toContain('value="kn" lang="kn"');
    expect(html).toContain("English");
    expect(html).toContain("ಕನ್ನಡ");
  });

  it("persists an explicit Kannada choice and switches fully back to English", () => {
    const setItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { setItem } });
    vi.stubGlobal("document", { documentElement: { lang: "en" } });
    setSiteLanguage("kn");
    expect(setItem).toHaveBeenCalledWith(LANGUAGE_STORAGE_KEY, "kn");
    expect(document.documentElement.lang).toBe("kn");
    expect(translateText("About Us")).toBe("ನಮ್ಮ ಬಗ್ಗೆ");
    expect(translateText("  Save payroll ")).toBe("  ವೇತನಪಟ್ಟಿ ಉಳಿಸಿ ");
    setSiteLanguage("en");
    expect(translateText("About Us")).toBe("About Us");
    expect(document.documentElement.lang).toBe("en");
  });

  it("works when browser storage is blocked", () => {
    vi.stubGlobal("window", { localStorage: { setItem: () => { throw new Error("blocked"); } } });
    expect(() => setSiteLanguage("kn")).not.toThrow();
    expect(getSiteLanguage()).toBe("kn");
  });

  it("handles dynamic messages with Kannada dates and preserves IDs and numbers", () => {
    setSiteLanguage("kn");
    expect(translateText(`Payroll for Example Ltd · ${monthLabel("2026-10")} deleted`)).toContain("ಅಳಿಸಲಾಗಿದೆ");
    expect(translateText("Employee ID for Sanjay N")).toContain("Sanjay N");
    expect(translateText("29EQOPR8753K1ZM")).toBe("29EQOPR8753K1ZM");
    expect(translateText("0007")).toBe("0007");
    expect(translateText(16000)).toBe(16000);
    expect(indiaToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(monthLabel("2026-10")).toMatch(/[\u0c80-\u0cff]/);
    expect(monthLabel("2026-10", "en-IN")).toBe("October 2026");
  });

  it("understands Kannada chat questions and returns translatable replies", () => {
    setSiteLanguage("kn");
    for (const question of ["ನನಗೆ ಕೆಲಸಗಾರರು ಬೇಕು", "ಉದ್ಯೋಗಕ್ಕೆ ಅರ್ಜಿ ಸಲ್ಲಿಸುವುದು ಹೇಗೆ?", "ನಿಮ್ಮ ಸಂಪರ್ಕ ವಿವರಗಳು", "ವೇತನ ಎಷ್ಟು?"]) {
      const answer = getBusinessAnswer(question, []);
      expect(translateText(answer.text)).toMatch(/[\u0c80-\u0cff]/);
      expect(answer.actions?.length).toBeGreaterThan(0);
    }
  });
});

describe("translated pages and forms", () => {
  it("renders the whole public homepage in Kannada", () => {
    setSiteLanguage("kn");
    const html = render(createElement(Home), [[["jobs"], []], [["clients"], []]]);
    for (const english of ["About Us", "Our Services", "Industries We Serve", "Our Compliance Commitment", "Need Reliable Workforce?", "Quick Links", "Company Name *"]) {
      expect(html).toContain(translateText(english));
      expect(html).not.toContain(`>${english}<`);
    }
    expect(html).toContain('data-testid="website-language-selector"');
    expect(html).toContain("29EQOPR8753K1ZM");
    expect(html).toContain('data-testid="worker-registration-form"');
  });

  it("renders the privacy paragraphs and all admin navigation in Kannada", () => {
    setSiteLanguage("kn");
    expect(render(createElement(Privacy))).toContain(translateText("Storage and removal"));
    const html = render(createElement(Admin), [[["admin-me"], { ok: true }]]);
    for (const label of ["Worker Applications", "Talent Bank", "Company Workforce", "Payroll", "Invoices", "Expenses", "Profit & Loss", "Security"]) expect(html).toContain(translateText(label));
    expect(html).toContain('data-testid="website-language-selector"');
  });

  it("translates job descriptions and retains form field values", () => {
    setSiteLanguage("kn");
    const job = { id: "sample", title: "General worker", location: "Mysore", skill_category: "Skilled", description: "No service or application fee is charged to candidates.", description_kn: null, created_at: "2026-10-17T00:00:00Z", openings: 5 };
    const html = render(createElement(Routes, null, createElement(Route, { path: "/jobs/:jobId", element: createElement(JobDetail) })), [[["job-detail", "sample"], job]], "/jobs/sample");
    expect(html).toContain("ಸಾಮಾನ್ಯ ಕೆಲಸಗಾರ");
    expect(html).toContain(candidateCopy.kn.noFee);
    expect(html).not.toContain(candidateCopy.kn.descriptionEnglish);
    expect(html).toContain('value="Skilled"');
  });

  it.each([
    ["Workforce", () => createElement(WorkforceManager, { pin: "session" }), "Add a person working at a company"],
    ["Talent Bank", () => createElement(TalentBank, { pin: "session" }), "Add Talent"],
    ["Payroll", () => createElement(Payroll), "Payroll"],
    ["Expenses", () => createElement(Expenses), "Add an expense"],
    ["Profit & Loss", () => createElement(ProfitLoss), "Profit & Loss"],
    ["Company request", () => createElement(CompanyForm), "Company Name *"],
  ] as const)("renders %s labels in Kannada", (_name, component, label) => {
    setSiteLanguage("kn");
    expect(render(component())).toContain(translateText(label));
  });

  it("renders invoice company controls in Kannada without changing company identifiers", () => {
    setSiteLanguage("kn");
    const html = render(createElement(Invoices), [
      [["invoice-profile"], { name: "Example Ltd", address: "", phone: "", email: "", website: "", gstin: "", payment_details: "" }],
      [["invoice-companies"], [{ id: "company-001", name: "Example Manufacturing", address: "", gstin: "" }]],
    ]);
    expect(html).toContain(translateText("Invoices"));
    expect(html).toContain(translateText("Select a company"));
    expect(html).toContain('value="company-001"');
    expect(html).toContain("Example Manufacturing");
  });
});

it("has Kannada copy for every literal display string in React components", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const missing = new Set<string>();
  function walk(folder: string) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const filename = path.join(folder, entry.name);
      if (entry.isDirectory()) { walk(filename); continue; }
      if (!filename.endsWith(".tsx") || filename.includes(".test.")) continue;
      const ast = parse(readFileSync(filename, "utf8"), { sourceType: "module", plugins: ["typescript", "jsx"] });
      function visit(node: unknown): void {
        if (!node || typeof node !== "object") return;
        const value = node as { type?: string; callee?: { name?: string }; arguments?: Array<{ type?: string; value?: string }> };
        if (value.type === "CallExpression" && value.callee?.name === "translateText" && value.arguments?.[0]?.type === "StringLiteral") {
          const key = value.arguments[0].value!.replace(/\s+/g, " ").trim();
          const exempt = ["English", "ESI", "PF", "PDF", "MB", "(2 MB)", "TTL", "RESEND_API_KEY"];
          if (/[A-Za-z]{2}/.test(key) && !/[\u0c80-\u0cff]/.test(key) && !key.includes("@") && !key.endsWith(".in") && !exempt.includes(key) && !(key in kannada)) missing.add(key);
        }
        for (const item of Object.values(node)) {
          if (Array.isArray(item)) item.forEach(visit);
          else if (item && typeof item === "object") visit(item);
        }
      }
      visit(ast);
    }
  }
  walk(root);
  expect([...missing]).toEqual([]);
});

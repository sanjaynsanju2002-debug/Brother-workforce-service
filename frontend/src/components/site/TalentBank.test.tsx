import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TalentBank from "./TalentBank";
import WorkerForm from "./WorkerForm";
import type { Worker } from "@/types";

describe("qualification controls", () => {
  it("shows the existing candidate qualification with an edit action and filters", () => {
    const queryClient = new QueryClient();
    const worker: Worker = { id: "example", full_name: "Example Candidate", mobile: "9876543210", current_location: "Mysuru", skill_category: "Skilled", education: "ITI - Fitter", source: "Talent Bank", status: "Available", created_at: "2026-10-18" };
    queryClient.setQueryData(["admin-talents", "test"], [worker]);
    const html = renderToStaticMarkup(<QueryClientProvider client={queryClient}><TalentBank pin="test" /></QueryClientProvider>);
    expect(html).toMatch(/data-testid="talent-qualification-example">ITI - Fitter<\/p>/);
    expect(html).toContain('aria-label="Edit qualification for Example Candidate"');
    expect(html).toContain('id="talent-qualification-filter"');
    expect(html).toContain('id="talent-search"');
  });
  it("asks new applicants for qualification before the optional-details panel", () => {
    const queryClient = new QueryClient();
    const html = renderToStaticMarkup(<QueryClientProvider client={queryClient}><MemoryRouter><WorkerForm /></MemoryRouter></QueryClientProvider>);
    const qualification = html.indexOf('id="worker-education"');
    expect(qualification).toBeGreaterThan(0);
    expect(qualification).toBeLessThan(html.indexOf("<details"));
    expect(html).toContain('for="worker-education"');
  });
});

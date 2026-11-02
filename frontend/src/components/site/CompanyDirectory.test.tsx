import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CompanyDirectory from "./CompanyDirectory";
import type { Client } from "@/types";

function company(id: string, archived: boolean): Client {
  return {
    id,
    name: archived ? "Archived Factory" : "Active Factory",
    billing_address: archived ? "Old billing address" : "Current billing address",
    gstin: archived ? "29ARCHIVED" : "29ACTIVE",
    industry: null,
    location: "Mysuru",
    headcount: null,
    service_summary: null,
    outcome: null,
    visible: false,
    archived,
    logo_filename: null,
    sort_order: 0,
    created_at: "2026-11-02T00:00:00Z",
  };
}

describe("company billing directory", () => {
  it("offers profile editing for both active and archived companies", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    queryClient.setQueryData(["admin-clients", "directory"], [company("active", false)]);
    queryClient.setQueryData(["archived-companies"], [company("archived", true)]);

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <CompanyDirectory />
      </QueryClientProvider>,
    );

    expect(html).toContain('data-testid="company-profile-edit-active"');
    expect(html).toContain('data-testid="archived-company-profile-edit-archived"');
    expect(html).toContain("29ACTIVE");
    expect(html).toContain("29ARCHIVED");
    expect(html).toContain("Billing address:");
  });
});

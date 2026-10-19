import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Invoices from "./Invoices";
import { invoiceRows } from "@/lib/invoice";

describe("invoice billing modes", () => {
  it("asks for the service type before showing company selection", () => {
    const qc = new QueryClient();
    qc.setQueryData(["invoice-profile"], { name: "Brothers Workforce Solutions", address: "", phone: "", email: "", website: "", gstin: "", payment_details: "" });
    qc.setQueryData(["invoice-companies"], [{ id: "example", name: "Example", address: "", gstin: "" }]);
    const html = renderToStaticMarkup(<QueryClientProvider client={qc}><Invoices /></QueryClientProvider>);
    expect(html).toContain('data-testid="invoice-mode-managed_services"');
    expect(html).toContain('data-testid="invoice-mode-services_only"');
    expect(html).not.toContain('id="invoice-company"');
    expect(html).not.toContain('data-testid="invoice-lines"');
  });

  it("has just Men and Women for Services only while retaining the Managed services rows", () => {
    expect(invoiceRows("services_only").map(([key, label]) => [key, label])).toEqual([["men", "Men"], ["women", "Women"]]);
    expect(invoiceRows("managed_services")).toHaveLength(8);
  });
});

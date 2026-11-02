import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Invoices from "./Invoices";
import { createInvoiceItem, editableInvoiceItems, INVOICE_BILLING_OPTIONS } from "@/lib/invoice";

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

  it("starts with an empty custom item and no preset skill or gender sections", () => {
    expect(createInvoiceItem()).toMatchObject({ category: "", description: "", quantity: "1", rate: "", amount: null });
    expect(INVOICE_BILLING_OPTIONS[1].description).not.toMatch(/men|women/i);
  });

  it("opens previous charge rows as editable items without changing their recorded row totals", () => {
    const items = editableInvoiceItems([
      { key: "skilled_men", quantity: "3", rate: "33.33" },
      { key: "skilled_women", quantity: "0", rate: "0" },
      { key: "other", quantity: "1", rate: "500" },
    ], { skilled_men: "100.00", skilled_women: "0.00", other: "500.00" });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ key: "item_skilled_men", category: "Skilled", quantity: "3", rate: "33.33", amount: "100.00" });
    expect(items[1]).toMatchObject({ category: "Other charges", description: "Other charges", amount: "500.00" });
    expect(editableInvoiceItems(items, {})).toEqual(items);
  });
});

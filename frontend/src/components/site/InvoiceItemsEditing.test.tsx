// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import Invoices from "./Invoices";

vi.mock("./CompanyDirectory", () => ({ default: () => null }));
vi.mock("@/components/operations/Payments", () => ({ InvoicePayments: () => null }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("edits five-column invoice items, switches between automatic and manual amounts, and saves the entered text", async () => {
  // happy-dom misreports fractional number steps; numeric constraints are also
  // covered by the API tests and the real-browser form check.
  const validity = vi.spyOn(HTMLFormElement.prototype, "reportValidity").mockReturnValue(true);
  const company = { id: "00000000-0000-4000-8000-000000000001", name: "Invoice example", address: "Example address", gstin: "" };
  const profile = { name: "Example business", address: "Example address", phone: "", email: "", website: "", gstin: "", payment_details: "" };
  type Body = { lines: { key: string; category: string; description: string; quantity: string; rate: string; amount: string | null }[] } & Record<string, unknown>;
  const saves: Body[] = [];
  const totals = (body: Body) => {
    const first = body.lines[0];
    const amount = first.amount ?? (first.quantity === "3" && first.rate === "33.33" ? "99.99" : "0.00");
    return { line_amounts: Object.fromEntries(body.lines.map((line, index) => [line.key, index ? "0.00" : amount])), base_amount: amount, service_charge: "0.00", esi_amount: "0.00", pf_amount: "0.00", subtotal: amount, cgst_amount: "0.00", sgst_amount: "0.00", gst_amount: "0.00", total: amount };
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Body;
    let value: unknown;
    if (url.endsWith("/profile")) value = profile;
    else if (url.endsWith("/companies")) value = [company];
    else if (url.includes("/invoices?")) value = { items: [], total: 0, page: 1, page_size: 50 };
    else if (url.endsWith("/preview")) value = totals(body);
    else if (url === "/api/admin/invoices" && init?.method === "POST") {
      saves.push(body);
      value = { ...body, id: "saved", revision: 1, totals: totals(body), payment_status: "Pending", created_at: "2026-11-02T00:00:00Z", updated_at: "2026-11-02T00:00:00Z" };
    } else throw new Error(`Unexpected request ${url}`);
    return new Response(JSON.stringify(value));
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const change = (selector: string, value: string) => act(() => {
    const element = host.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector)!;
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const field = (label: string) => `[aria-label="${label} for item 1"]`;
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><Invoices /></QueryClientProvider>));
    await vi.waitFor(async () => { await act(async () => {}); expect(host.querySelector('[data-testid="invoice-mode-managed_services"]')).not.toBeNull(); });
    act(() => host.querySelector<HTMLInputElement>('[data-testid="invoice-mode-managed_services"]')!.click());
    change("#invoice-company", company.id);
    expect(Array.from(host.querySelectorAll('[data-testid="invoice-lines"] th')).map((cell) => cell.textContent)).toEqual(["Category", "Description", "Quantity", "Rate", "Amount"]);
    expect(host.querySelector('[data-testid="invoice-lines"]')!.textContent).not.toMatch(/Skilled|Unskilled|Semi-skilled|Men|Women/);
    change(field("Category"), "Packing");
    change(field("Description"), "Packing and dispatch support");
    change(field("Quantity"), "3");
    change(field("Rate"), "33.33");
    await vi.waitFor(async () => { await act(async () => {}); expect((host.querySelector(field("Amount")) as HTMLInputElement).value).toBe("99.99"); });
    change(field("Amount"), "100.00");
    expect(host.textContent).toContain("Manual total");
    await vi.waitFor(async () => { await act(async () => {}); expect(host.querySelector('[data-testid="invoice-total"]')!.textContent).toBe("₹100.00"); });
    act(() => host.querySelector<HTMLButtonElement>('[data-testid="invoice-add-item"]')!.click());
    expect(host.querySelectorAll('[data-testid^="invoice-item-"]')).toHaveLength(2);
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Remove invoice item 2"]')!.click());
    expect(host.querySelectorAll('[data-testid^="invoice-item-"]')).toHaveLength(1);
    expect((host.querySelector(field("Description")) as HTMLTextAreaElement).value).toBe("Packing and dispatch support");
    change("#invoice-number", "BWS-TEST-1");
    act(() => host.querySelector<HTMLFormElement>('form:has([data-testid="invoice-lines"])')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await vi.waitFor(async () => { await act(async () => {}); expect(saves).toHaveLength(1); });
    expect(saves[0].lines[0]).toMatchObject({ category: "Packing", description: "Packing and dispatch support", quantity: "3", rate: "33.33", amount: "100.00" });
    expect(saves[0]).toMatchObject({ company_id: company.id, client_name: company.name, supplier: profile, service_percentage: "0", cgst_percentage: "0", sgst_percentage: "0" });
    change(field("Rate"), "0");
    expect(host.textContent).not.toContain("Manual total");
    await vi.waitFor(async () => { await act(async () => {}); expect((host.querySelector(field("Amount")) as HTMLInputElement).value).toBe("0.00"); });
  } finally {
    await act(async () => root.unmount()); client.clear(); validity.mockRestore(); vi.unstubAllGlobals(); host.remove();
  }
});

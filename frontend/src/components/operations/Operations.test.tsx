// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import Attendance from "./Attendance";
import { InvoicePayments } from "./Payments";
import Recruitment from "./Recruitment";
import { invoiceBalance, invoicePaid, type InvoicePaymentRecord } from "@/lib/operations";
import { indiaToday } from "@/lib/finance";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });
const enter = (label: string, value: string) => act(() => {
  const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`)!;
  const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
});
const clickText = (text: string) => act(() => Array.from(document.querySelectorAll("button")).find((b) => b.textContent === text)!.click());
// happy-dom uses exact floating-point modulo for step=0.01 and rejects valid
// hundredths. Dispatch submit after checking the other native constraints;
// the API integration suite verifies decimal precision and bounds independently.
const submitText = (text: string) => act(() => {
  const button = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === text)!;
  button.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
});
const waitFor = async (f: () => void) => vi.waitFor(async () => { await act(async () => {}); f(); });
function mount(component: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  document.body.innerHTML = "<div id='root'></div>"; const root = createRoot(document.getElementById("root")!);
  act(() => root.render(<QueryClientProvider client={qc}>{component}</QueryClientProvider>));
  return () => { act(() => root.unmount()); qc.clear(); };
}

it("keeps paise precise when deriving balances and recognises legacy paid snapshots", () => {
  const i: InvoicePaymentRecord = { id: "i", revision: 1, invoice_number: "QA-1", client_name: "QA", invoice_date: "2026-01-01", totals: { total: "9999999999999.99" }, payment_status: "Partially Paid", opening_paid_amount: "0.01", payments: [{ id: "p", amount: "100.01", payment_date: "2026-01-01", method: "Cash", reference: "", notes: "", by: "QA" }] };
  expect(invoicePaid(i)).toBe("100.02"); expect(invoiceBalance(i)).toBe("9999999999899.97");
  expect(invoiceBalance({ ...i, opening_paid_amount: null, payments: [], payment_status: "Paid" })).toBe("0.00");
});

it("records a partial client receipt, updates its balance, and preserves the ledger after a conflict", async () => {
  const original: InvoicePaymentRecord = { id: "invoice", revision: 1, invoice_number: "QA-1", client_name: "QA Factory", invoice_date: indiaToday(), totals: { total: "1000.00" }, payment_status: "Pending", opening_paid_amount: "0.00", payments: [] };
  const writes: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)); writes.push(body);
    if (writes.length > 1) return new Response(JSON.stringify({ detail: "Changed in another session. Reload." }), { status: 409 });
    return new Response(JSON.stringify({ ...original, revision: 2, payment_status: "Partially Paid", payments: [{ id: body.request_id, amount: body.amount, payment_date: body.payment_date, method: body.method, reference: body.reference, notes: "", by: "Owner" }] }));
  }));
  function View() { const [invoice, setInvoice] = useState(original); return <InvoicePayments invoice={invoice} onUpdated={setInvoice} disabled={false} />; }
  const cleanup = mount(<View />);
  try {
    enter("Payment amount", "250.01"); enter("Payment reference", "BANK-QA-1");
    expect(Array.from(document.querySelectorAll("form input")).filter((f) => (f as HTMLInputElement).validity.valueMissing || (f as HTMLInputElement).validity.rangeUnderflow || (f as HTMLInputElement).validity.rangeOverflow).map((f) => [f.getAttribute("aria-label"), (f as HTMLInputElement).validationMessage])).toEqual([]);
    submitText("Record client receipt");
    await waitFor(() => expect(document.querySelector("#invoice-receipts")?.textContent).toContain("₹749.99"));
    expect(writes[0]).toMatchObject({ amount: "250.01", reference: "BANK-QA-1", revision: 1 }); expect(writes[0]).not.toHaveProperty("kind");
    enter("Payment amount", "50"); submitText("Record client receipt");
    await waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain("Changed in another session"));
    expect(document.querySelector("#invoice-receipts")?.textContent).toContain("BANK-QA-1");
    expect(writes[1].revision).toBe(2);
  } finally { cleanup(); }
});

it("starts attendance unmarked, saves every employee and only approves a reviewed draft", async () => {
  let sheet: Record<string, unknown> | null = null;
  const writes: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/admin/clients") return new Response(JSON.stringify([{ id: "company", name: "QA Factory" }]));
    if (!init?.method || init.method === "GET") return new Response(JSON.stringify({ company_name: "QA Factory", employees: [{ id: "assignment", full_name: "QA Employee", role: "Assembler" }], sheet }));
    const body = JSON.parse(String(init.body)); writes.push({ url, body });
    sheet = url.endsWith("/approve") ? { ...sheet, revision: 2, status: "Approved", approved_by: "Owner" } : { id: "sheet", revision: 1, status: "Draft", rows: [{ ...body.rows[0], full_name: "QA Employee", role: "Assembler" }], notes: "" };
    return new Response(JSON.stringify(sheet));
  }));
  const cleanup = mount(<Attendance />);
  try {
    await waitFor(() => expect(document.querySelector('[aria-label="Attendance company"]')?.textContent).toContain("QA Factory"));
    enter("Attendance company", "company");
    await waitFor(() => expect(document.querySelector('[aria-label="Attendance for QA Employee"]')).toBeTruthy());
    expect((document.querySelector('[aria-label="Attendance for QA Employee"]') as HTMLSelectElement).value).toBe("Unmarked");
    expect(Array.from(document.querySelectorAll("button")).some((b) => b.textContent === "Approve attendance")).toBe(false);
    enter("Attendance for QA Employee", "Half-day"); enter("Overtime hours for QA Employee", "2.5");
    expect(Array.from(document.querySelectorAll("form input")).filter((f) => (f as HTMLInputElement).validity.valueMissing || (f as HTMLInputElement).validity.rangeUnderflow || (f as HTMLInputElement).validity.rangeOverflow).map((f) => [f.getAttribute("aria-label"), (f as HTMLInputElement).validationMessage])).toEqual([]);
    submitText("Save draft");
    await waitFor(() => expect(Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "Approve attendance")?.disabled).toBe(false));
    expect(writes[0].body.rows).toEqual([{ assignment_id: "assignment", status: "Half-day", shift: "General", overtime_hours: "2.5" }]);
    clickText("Approve attendance");
    await waitFor(() => expect(document.body.textContent).toContain("Approved by Owner"));
    expect(writes[1]).toMatchObject({ url: "/api/admin/operations/attendance/sheet/approve", body: { revision: 1 } });
    expect((document.querySelector('[aria-label="Attendance for QA Employee"]') as HTMLSelectElement).closest("fieldset")?.disabled).toBe(true);
  } finally { cleanup(); }
});

it("links recruitment to an existing candidate and saves interview and follow-up dates", async () => {
  let write: Record<string, unknown> | undefined;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") { write = JSON.parse(String(init.body)); return new Response(JSON.stringify({ ...write, id: "progress" })); }
    const data = url === "/api/admin/clients" ? [{ id: "company", name: "QA Factory" }] : url === "/api/admin/talents" ? [{ id: "worker", full_name: "QA Candidate", education: "ITI", mobile: "0000000000", status: "Available" }] : [];
    return new Response(JSON.stringify(data));
  }));
  const cleanup = mount(<Recruitment />);
  try {
    await waitFor(() => expect(document.querySelector('[aria-label="Recruitment candidate"]')?.textContent).toContain("QA Candidate"));
    enter("Recruitment candidate", "worker"); enter("Recruitment company", "company"); enter("Recruitment stage", "Interview");
    // The date control supports typing via the shared manual-entry toggle.
    const date = document.querySelector<HTMLInputElement>('[aria-label="Interview date"]')!;
    act(() => document.querySelector<HTMLButtonElement>(`button[aria-controls="${date.id}"]`)!.click());
    enter("Interview date", "12/11/2026"); clickText("Save progress");
    await waitFor(() => expect(write).toMatchObject({ worker_id: "worker", company_id: "company", stage: "Interview", interview_date: "2026-11-12", follow_up_date: null }));
    expect(write).not.toHaveProperty("worker_name");
  } finally { cleanup(); }
});

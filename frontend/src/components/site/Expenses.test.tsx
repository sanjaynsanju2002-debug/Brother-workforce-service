// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import Expenses from "./Expenses";
import { indiaToday } from "@/lib/finance";
import type { Expense } from "@/lib/finance";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("saves and edits historical dates, then displays the expense in its new month", async () => {
  const entries: Expense[] = [];
  const requests: { method: string; date: string }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method || "GET";
    if (url === "/api/admin/clients") return new Response("[]");
    if (method === "POST" || method === "PUT") {
      const body = init!.body as FormData;
      const date = String(body.get("expense_date"));
      requests.push({ method, date });
      const entry: Expense = { id: "synthetic-expense", expense_date: date, description: String(body.get("description")), amount: String(body.get("amount")), bill_filename: null, revision: method === "POST" ? 1 : 2, created_at: "2026-10-23T00:00:00Z" };
      entries.splice(0, entries.length, entry);
      return new Response(JSON.stringify(entry));
    }
    const month = new URL(url, "https://test.invalid").searchParams.get("month");
    const items = entries.filter((item) => item.expense_date.startsWith(month!));
    return new Response(JSON.stringify({ items, month, total: items.length, total_amount: items.length ? "0.01" : "0.00", page: 1, page_size: 50 }));
  }));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["admin-expenses", indiaToday().slice(0, 7), 1], { items: [], month: indiaToday().slice(0, 7), total: 0, total_amount: "0.00", page: 1, page_size: 50 });
  document.body.innerHTML = "<div id='root'></div>";
  const root = createRoot(document.querySelector("#root")!);
  const enter = (id: string, value: string) => act(() => {
    const field = document.getElementById(id) as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const click = (selector: string) => act(() => document.querySelector<HTMLButtonElement>(selector)!.click());
  try {
    act(() => root.render(<QueryClientProvider client={qc}><Expenses /></QueryClientProvider>));
    click("button[aria-controls='expense-date']");
    enter("expense-date", "29/02/2024"); enter("expense-amount", "0.01"); enter("expense-description", "Historical office bill");
    expect((document.getElementById("expense-date") as HTMLInputElement).value).toBe("29/02/2024");
    expect((document.getElementById("expense-amount") as HTMLInputElement).value).toBe("0.01");
    expect((document.getElementById("expense-description") as HTMLInputElement).value).toBe("Historical office bill");
    expect(Array.from(document.querySelectorAll("form input")).filter((field) => !(field as HTMLInputElement).validity.valid).map((field) => [field.id, (field as HTMLInputElement).validationMessage])).toEqual([]);
    click("[data-testid='expense-save']");
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(requests).toEqual([{ method: "POST", date: "2024-02-29" }]);
      expect(document.querySelector("[data-testid='expenses-table']")?.textContent).toContain("Historical office bill");
    });
    expect(requests).toEqual([{ method: "POST", date: "2024-02-29" }]);
    expect((document.getElementById("expenses-month") as HTMLInputElement).value).toBe("2024-02");
    expect(document.querySelector("[data-testid='expenses-total']")?.textContent).toContain("0.01");
    click("button[aria-label='Edit Historical office bill']");
    expect((document.getElementById("expense-date") as HTMLInputElement).value).toBe("29/02/2024");
    enter("expense-date", "31/12/2023"); click("[data-testid='expense-save']");
    await vi.waitFor(async () => {
      await act(async () => {});
      expect((document.getElementById("expenses-month") as HTMLInputElement).value).toBe("2023-12");
      expect(document.querySelector("[data-testid='expenses-table']")?.textContent).toContain("31/12/2023");
    });
    expect(requests[1]).toEqual({ method: "PUT", date: "2023-12-31" });
  } finally {
    act(() => root.unmount()); qc.clear(); vi.unstubAllGlobals(); document.body.innerHTML = "";
  }
});

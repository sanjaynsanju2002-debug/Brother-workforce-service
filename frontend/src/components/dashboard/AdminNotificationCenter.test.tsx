// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import AdminNotificationCenter from "./AdminNotificationCenter";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => { vi.unstubAllGlobals(); window.localStorage.clear(); document.body.innerHTML = ""; });

it("shows live admin alerts, navigates to their section, and remembers read updates", async () => {
  const traffic = { visits_total: 20, visits_today: 4, visits_week: 12, workers_total: 5, workers_today: 2, requests_total: 1, requests_today: 1 };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/admin/traffic")) return new Response(JSON.stringify(traffic));
    if (url.endsWith("/admin/stats")) return new Response(JSON.stringify({ workers: 5, requests: 1, open_requests: 1, active_jobs: 2, email_configured: true }));
    return new Response(JSON.stringify({ date: "2026-11-02", outstanding: "1000.00", overdue: "250.00", salary_payable: "5000.00", salary_paid: "3000.00", salary_balance: "2000.00", unmarked: 0, draft_sheets: 0, reminders: [] }));
  }));
  const navigate = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById("root")!);
  try {
    act(() => root.render(<QueryClientProvider client={client}><AdminNotificationCenter onNavigate={navigate} /></QueryClientProvider>));
    await vi.waitFor(async () => { await act(async () => {}); expect(document.querySelector('[data-testid="admin-notification-count"]')?.textContent).toBe("5"); });
    act(() => document.querySelector<HTMLButtonElement>('[data-testid="admin-notification-bell"]')!.click());
    await vi.waitFor(() => expect(document.querySelector('[data-testid="admin-notification-panel"]')?.textContent).toContain("₹1,000.00 client invoice balance"));
    act(() => document.querySelector<HTMLButtonElement>('[data-testid="admin-notification-applications"]')!.click());
    expect(navigate).toHaveBeenCalledWith("workers");
    expect(document.querySelector('[data-testid="admin-notification-count"]')?.textContent).toBe("4");
    act(() => document.querySelector<HTMLButtonElement>('[data-testid="admin-notification-bell"]')!.click());
    act(() => document.querySelector<HTMLButtonElement>('[data-testid="admin-notification-read-all"]')!.click());
    expect(document.querySelector('[data-testid="admin-notification-count"]')).toBeNull();

    traffic.workers_total = 6;
    await act(async () => { await client.invalidateQueries({ queryKey: ["admin-traffic", "session"] }); });
    await vi.waitFor(() => expect(document.querySelector('[data-testid="admin-notification-count"]')?.textContent).toBe("1"));
  } finally {
    act(() => root.unmount()); client.clear();
  }
});

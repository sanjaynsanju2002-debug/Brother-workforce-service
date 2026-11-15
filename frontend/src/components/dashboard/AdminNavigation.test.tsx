// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AdminNavigation, AdminSection } from "./AdminNavigation";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("opens one menu group at a time without changing the page, then navigates to the chosen item", () => {
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  const navigate = vi.fn();
  function Dashboard() {
    const [tab, setTab] = useState("attendance");
    return <><AdminNavigation role="owner" activeTab={tab} onNavigate={(next) => { navigate(next); setTab(next); }} />
      <AdminSection activeTab={tab} value="attendance"><input aria-label="Unsaved draft" defaultValue="Keep these edits" /></AdminSection>
      <AdminSection activeTab={tab} value="invoices">Invoice editor</AdminSection></>;
  }
  const button = (id: string) => host.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!;
  const click = (id: string) => act(() => button(id).click());
  const visible = (id: string) => !button(id).closest('[aria-hidden="true"]');
  try {
    act(() => root.render(<Dashboard />));
    expect(host.querySelectorAll('h2 button[aria-expanded="false"]')).toHaveLength(5);
    expect(visible("admin-tab-attendance")).toBe(false);
    expect(visible("admin-tab-invoices")).toBe(false);
    click("admin-sidebar-toggle");
    click("admin-group-workforce-toggle");
    expect(button("admin-sidebar-toggle").getAttribute("aria-expanded")).toBe("true");
    expect(visible("admin-tab-attendance")).toBe(true);
    click("admin-group-finance-toggle");
    expect(visible("admin-tab-attendance")).toBe(false);
    expect(visible("admin-tab-invoices")).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    expect(host.querySelector<HTMLInputElement>('[aria-label="Unsaved draft"]')?.value).toBe("Keep these edits");
    click("admin-tab-invoices");
    expect(navigate).toHaveBeenCalledExactlyOnceWith("invoices");
    expect(button("admin-tab-invoices").getAttribute("aria-current")).toBe("page");
    expect(button("admin-sidebar-toggle").getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector('[aria-label="Unsaved draft"]')).toBeNull();
    expect(host.querySelector("#admin-panel-invoices")?.textContent).toBe("Invoice editor");
    click("admin-group-finance-toggle");
    expect(visible("admin-tab-invoices")).toBe(false);
    expect(host.querySelector("#admin-panel-invoices")?.textContent).toBe("Invoice editor");
  } finally { act(() => root.unmount()); host.remove(); }
});

it("keeps role restrictions when opening groups", () => {
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  try {
    act(() => root.render(<AdminNavigation role="attendance" activeTab="attendance" onNavigate={() => {}} />));
    expect(host.querySelector('[data-testid="admin-group-finance-toggle"]')).toBeNull();
    expect(host.querySelector('[data-testid="admin-tab-workforce"]')).toBeNull();
    expect(host.querySelector('[data-testid="admin-tab-activity"]')).toBeNull();
    act(() => host.querySelector<HTMLButtonElement>('[data-testid="admin-group-workforce-toggle"]')!.click());
    expect(host.querySelector('[data-testid="admin-tab-attendance"]')?.closest('[aria-hidden="true"]')).toBeNull();
    expect(host.querySelector('[data-testid="admin-tab-security"]')).not.toBeNull();
  } finally { act(() => root.unmount()); host.remove(); }
});

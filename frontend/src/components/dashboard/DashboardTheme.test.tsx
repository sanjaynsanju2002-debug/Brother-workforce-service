// @vitest-environment happy-dom
import { StrictMode, act, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { afterEach, expect, it, vi } from "vitest";
import { DashboardTheme, DashboardThemeToggle } from "./DashboardTheme";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const storageKey = "bws-dashboard-theme";
afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); document.documentElement.className = ""; document.documentElement.removeAttribute("data-dashboard-theme"); document.documentElement.style.colorScheme = ""; document.body.innerHTML = ""; });

function Panel() {
  const [notes, setNotes] = useState("");
  return <><DashboardThemeToggle /><input aria-label="Unsaved payroll notes" value={notes} onChange={(e) => setNotes(e.target.value)} />{createPortal(<div data-testid="dropdown">Company options</div>, document.body)}</>;
}
function mount() {
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<StrictMode><DashboardTheme><Panel /></DashboardTheme></StrictMode>));
  return () => { act(() => root.unmount()); container.remove(); };
}
const toggle = () => act(() => document.querySelector<HTMLButtonElement>('[data-testid="dashboard-theme-toggle"]')!.click());

it("remembers the chosen theme across reloads without losing unsaved form input", () => {
  let cleanup = mount();
  try {
    const input = document.querySelector<HTMLInputElement>('[aria-label="Unsaved payroll notes"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Keep this unfinished payroll");
      input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    toggle();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(storageKey)).toBe("dark");
    expect(document.querySelector('[data-testid="dashboard-theme-toggle"]')?.getAttribute("aria-label")).toBe("Switch to light mode");
    expect(input.value).toBe("Keep this unfinished payroll");
    // Portalled menus use the same document theme as the dashboard.
    expect(document.querySelector('[data-testid="dropdown"]')?.closest(".dark")).toBe(document.documentElement);
    cleanup(); cleanup = mount();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
    toggle();
    expect(window.localStorage.getItem(storageKey)).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  } finally { cleanup(); }
});

it("restores the public page's theme on navigation and syncs changes from another tab", () => {
  document.documentElement.className = "public-page";
  document.documentElement.style.colorScheme = "light";
  window.localStorage.setItem(storageKey, "dark");
  const cleanup = mount();
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: storageKey, newValue: "light" })));
  expect(document.documentElement.classList.contains("dark")).toBe(false);
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: storageKey, newValue: "dark" })));
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  cleanup();
  expect(document.documentElement.className).toBe("public-page");
  expect(document.documentElement.style.colorScheme).toBe("light");
  expect(document.documentElement.hasAttribute("data-dashboard-theme")).toBe(false);
});

it("keeps the dashboard usable when browser storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Blocked"); });
  const cleanup = mount();
  try {
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    toggle(); expect(document.documentElement.classList.contains("dark")).toBe(true);
    toggle(); expect(document.documentElement.classList.contains("dark")).toBe(false);
  } finally { cleanup(); }
});

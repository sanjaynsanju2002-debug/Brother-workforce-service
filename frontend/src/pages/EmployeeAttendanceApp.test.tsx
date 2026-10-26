// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { InstallAppButton } from "./EmployeeAttendanceApp";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function mount() {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById("root")!);
  act(() => root.render(<InstallAppButton />));
  return () => act(() => root.unmount());
}

it("shows durable installation instructions when the browser cannot prompt", () => {
  const cleanup = mount();
  try {
    act(() => document.querySelector<HTMLButtonElement>('[data-testid="install-attendance-app"]')!.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Install on this device");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("does not download a separate APK file");
  } finally {
    cleanup();
  }
});

it("uses the native browser installation prompt when available", async () => {
  const cleanup = mount();
  try {
    const openPrompt = vi.fn(async () => undefined);
    const event = new Event("beforeinstallprompt");
    Object.defineProperties(event, {
      prompt: { value: openPrompt },
      userChoice: { value: Promise.resolve({ outcome: "accepted" }) },
    });
    act(() => window.dispatchEvent(event));
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="install-attendance-app"]')!.click();
      await Promise.resolve();
    });
    expect(openPrompt).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    cleanup();
  }
});

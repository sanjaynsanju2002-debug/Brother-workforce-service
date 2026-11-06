// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
it("keeps attendance credentials in memory and clears them on expiry and reload", async () => {
  localStorage.setItem("bws-employee-attendance-session", "legacy-token");
  vi.resetModules();
  const api = await import("./employeeApi");
  expect(localStorage.getItem("bws-employee-attendance-session")).toBeNull();
  api.setEmployeeAttendanceToken("test-token");
  expect(api.hasEmployeeAttendanceToken()).toBe(true);
  expect(localStorage.length).toBe(0);
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 401 }));
  vi.stubGlobal("fetch", fetcher);
  await api.employeeAttendanceFetch("/employee-attendance/me");
  expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer test-token");
  expect(api.hasEmployeeAttendanceToken()).toBe(false);
  api.setEmployeeAttendanceToken("another-test-token");
  vi.resetModules();
  expect((await import("./employeeApi")).hasEmployeeAttendanceToken()).toBe(false);
});

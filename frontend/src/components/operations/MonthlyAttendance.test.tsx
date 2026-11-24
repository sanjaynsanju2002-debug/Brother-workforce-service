// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import Attendance from "./Attendance";
import { canApproveDay, monthDates, workspaceDay, type AttendanceDraft, type AttendanceRow, type AttendanceSheet } from "@/lib/attendanceWorkspace";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.innerHTML = ""; });
const waitFor = async (check: () => void) => vi.waitFor(async () => { await act(async () => {}); check(); });
const button = (text: string) => [...document.querySelectorAll("button")].find(item => item.textContent === text)!;
const click = (text: string) => act(() => button(text).click());
const labelled = <T extends HTMLElement = HTMLElement>(label: string) => document.querySelector<T>(`[aria-label="${label}"]`)!;
const toggle = (label: string) => act(() => labelled<HTMLInputElement>(label).click());
const enter = (label: string, value: string) => act(() => {
  const element = labelled<HTMLInputElement | HTMLSelectElement>(label);
  const prototype = element.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true }));
});
const person = (id: string) => ({ id, full_name: `Employee ${id}`, role: "Operator" });
const row = (id: string, status: AttendanceRow["status"] = "Unmarked", overtime_hours = "0"): AttendanceRow => ({ assignment_id: id, full_name: `Employee ${id}`, role: "Operator", shift: "General", status, overtime_hours });
function fixture(failSecond = false) {
  const sheets: Record<string, AttendanceSheet> = {
    "2026-02-01": { id: "one", revision: 4, status: "Draft", notes: "First day note", rows: [row("a", "Present", "2"), row("b"), row("c", "Holiday")] },
    "2026-02-03": { id: "three", revision: 7, status: "Approved", notes: "Approved snapshot", rows: [row("historic", "Weekly off")] },
  };
  const writes: { url: string; method: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/admin/operations/attendance-companies") return new Response(JSON.stringify([{ id: "company", name: "Example Factory" }]));
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body)); writes.push({ url, method: "PUT", body });
      if (failSecond && body.attendance_date === "2026-02-02") return new Response(JSON.stringify({ detail: "Changed in another session. Reload this day." }), { status: 409 });
      const sheet: AttendanceSheet = { id: sheets[body.attendance_date]?.id ?? "two", revision: (body.revision ?? 0) + 1, status: "Draft", notes: body.notes, rows: body.rows.map((item: AttendanceRow) => ({ ...item, full_name: `Employee ${item.assignment_id}`, role: "Operator" })) };
      sheets[body.attendance_date] = sheet; return new Response(JSON.stringify(sheet));
    }
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)); writes.push({ url, method: "POST", body });
      const date = Object.keys(sheets).find(day => url.includes(`/${sheets[day].id}/`))!;
      sheets[date] = { ...sheets[date], revision: sheets[date].revision + 1, status: url.endsWith("/approve") ? "Approved" : "Draft" };
      return new Response(JSON.stringify(sheets[date]));
    }
    const date = new URL(url, "https://example.test").searchParams.get("attendance_date")!;
    const employees = date === "2026-02-01" ? [person("a"), person("b"), person("c")] : [person("a"), person("b"), person("d")];
    return new Response(JSON.stringify({ company_name: "Example Factory", employees, sheet: sheets[date] ?? null, review_warnings: [] }));
  }));
  return { sheets, writes };
}
async function mount(onPendingChange?: (state: { dirty: boolean; busy: boolean }) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  document.body.innerHTML = "<div id='root'></div>";
  const root = createRoot(document.getElementById("root")!);
  act(() => root.render(<QueryClientProvider client={client}><Attendance onPendingChange={onPendingChange} /></QueryClientProvider>));
  await waitFor(() => expect(labelled("Attendance company").textContent).toContain("Example Factory"));
  enter("Attendance month", "02/2026"); enter("Attendance company", "company");
  await waitFor(() => expect(labelled("Select 2026-02-01")).toBeTruthy());
  return { client, cleanup: () => { act(() => root.unmount()); client.clear(); } };
}

it("saves selected dates with leave, preserves overtime/holidays and roster boundaries, then approves explicitly", async () => {
  const { writes } = fixture(); const { cleanup } = await mount();
  try {
    expect(writes).toEqual([]);
    expect(labelled<HTMLInputElement>("Select 2026-02-01").checked).toBe(false);
    toggle("Select 2026-02-01"); toggle("Select 2026-02-02"); toggle("Select 2026-02-03");
    enter("Batch employee on leave", "b"); enter("Batch leave type", "Paid leave"); click("Apply to selected dates");
    click("Prepare remaining staff as present");
    expect(writes).toEqual([]);
    expect(labelled("Employee a, 2026-02-01: Present").textContent).toContain("+2h");
    expect(labelled("Employee c, 2026-02-01: Holiday")).toBeTruthy();
    expect(labelled("Employee historic, 2026-02-03: Weekly off, approved")).toBeTruthy();
    expect(labelled("Employee a, 2026-02-04: Unmarked")).toBeTruthy();
    expect(button("Approve selected days").disabled).toBe(true);
    click("Save changed days");
    await waitFor(() => expect(document.body.textContent).toContain("2 of 2 changed days saved"));
    expect(writes.map(write => write.method)).toEqual(["PUT", "PUT"]);
    expect(writes[0].body).toMatchObject({ attendance_date: "2026-02-01", revision: 4, notes: "First day note", rows: [{ assignment_id: "a", status: "Present", overtime_hours: "2" }, { assignment_id: "b", status: "Paid leave", overtime_hours: "0" }, { assignment_id: "c", status: "Holiday" }] });
    expect(writes[1].body).toMatchObject({ attendance_date: "2026-02-02", revision: null, rows: [{ assignment_id: "a", status: "Present" }, { assignment_id: "b", status: "Paid leave" }, { assignment_id: "d", status: "Present" }] });
    expect(button("Approve selected days").disabled).toBe(false);
    click("Approve selected days");
    await waitFor(() => expect(document.body.textContent).toContain("2 of 2 days approved for payroll"));
    expect(writes.slice(2)).toEqual([{ url: "/api/admin/operations/attendance/one/approve", method: "POST", body: { revision: 5 } }, { url: "/api/admin/operations/attendance/two/approve", method: "POST", body: { revision: 1 } }]);
    expect(labelled("Employee b, 2026-02-02: Paid leave, approved")).toBeTruthy();
  } finally { cleanup(); }
});

it("retains unsaved edits after a partial save and retries only failed days despite broad refreshes", async () => {
  const { writes } = fixture(true); const { cleanup, client } = await mount();
  try {
    toggle("Select 2026-02-01"); toggle("Select 2026-02-02");
    click("Prepare remaining staff as present"); click("Save changed days");
    await waitFor(() => expect(document.body.textContent).toContain("1 of 2 changed days saved"));
    expect(document.body.textContent).toContain("Your unsaved edits are kept");
    expect(labelled("Employee a, 2026-02-02: Present")).toBeTruthy();
    expect(button("Approve selected days").disabled).toBe(true);
    await act(async () => { await client.invalidateQueries({ queryKey: ["ops"] }); });
    expect(labelled("Employee a, 2026-02-02: Present")).toBeTruthy();
    act(() => labelled("Review day 2026-02-02").click());
    expect(labelled("Attendance day details").textContent).toContain("Changed in another session");
    vi.mocked(window.confirm).mockReturnValue(false);
    enter("Attendance month", "03/2026");
    expect(labelled<HTMLInputElement>("Attendance month").value).toBe("02/2026");
    click("Save changed days");
    await waitFor(() => expect(writes).toHaveLength(3));
    expect(writes[2].body.attendance_date).toBe("2026-02-02");
    expect(writes.filter(write => write.method === "POST")).toHaveLength(0);
  } finally { cleanup(); }
});

it("selects a date range, keeps half-day overtime, and leaves unselected dates unmarked", async () => {
  const { writes } = fixture(); const { cleanup } = await mount();
  try {
    enter("Select attendance from", "01/02/2026"); enter("Select attendance to", "02/02/2026"); click("Select dates");
    expect(labelled<HTMLInputElement>("Select 2026-02-01").checked).toBe(true);
    expect(labelled<HTMLInputElement>("Select 2026-02-02").checked).toBe(true);
    expect(labelled<HTMLInputElement>("Select 2026-02-03").checked).toBe(false);
    enter("Batch employee on leave", "a"); enter("Batch leave type", "Half-day"); click("Apply to selected dates");
    expect(labelled("Employee a, 2026-02-01: Half-day").textContent).toContain("+2h");
    expect(labelled("Employee a, 2026-02-04: Unmarked")).toBeTruthy();
    expect(writes).toEqual([]);
  } finally { cleanup(); }
});

it("opens approved days read-only and reopens only after explicit confirmation with the saved revision", async () => {
  const { writes } = fixture(); const { cleanup } = await mount();
  try {
    act(() => labelled("Employee historic, 2026-02-03: Weekly off, approved").click());
    expect(labelled("Edit attendance status").closest("fieldset")?.disabled).toBe(true);
    vi.mocked(window.confirm).mockReturnValue(false); click("Reopen for correction"); expect(writes).toEqual([]);
    vi.mocked(window.confirm).mockReturnValue(true); click("Reopen for correction");
    await waitFor(() => expect(labelled("Edit attendance status").closest("fieldset")?.disabled).toBe(false));
    expect(writes).toEqual([{ url: "/api/admin/operations/attendance/three/reopen", method: "POST", body: { revision: 7 } }]);
  } finally { cleanup(); }
});

it("uses correct month boundaries and requires a saved, complete, past draft with reviewed warnings for approval", () => {
  expect(monthDates("2024-02")).toHaveLength(29); expect(monthDates("2026-02")).toHaveLength(28); expect(monthDates("2026-13")).toEqual([]);
  const draft: AttendanceDraft = { company_name: "Example", employees: [person("a")], sheet: { id: "one", revision: 1, status: "Draft", notes: "", rows: [row("a", "Present")] }, review_warnings: ["Missing checkout"] };
  const day = workspaceDay(draft);
  expect(canApproveDay(day, "2026-02-01", "2026-02-02")).toBe(false);
  day.notes = "Manager verified full shift";
  expect(canApproveDay(day, "2026-02-01", "2026-02-02")).toBe(true);
  expect(canApproveDay({ ...day, dirty: true }, "2026-02-01", "2026-02-02")).toBe(false);
  expect(canApproveDay(day, "2026-02-03", "2026-02-02")).toBe(false);
  expect(canApproveDay({ ...day, sheet: null }, "2026-02-01", "2026-02-02")).toBe(false);
  expect(canApproveDay({ ...day, rows: [row("a")] }, "2026-02-01", "2026-02-02")).toBe(false);
});


it("warns about unsaved work and keeps company/month navigation blocked throughout a batch", async () => {
  fixture();
  const originalFetch = globalThis.fetch;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT" && JSON.parse(String(init.body)).attendance_date === "2026-02-02") await pending;
    return originalFetch(url, init);
  }));
  const state = vi.fn(); const { cleanup } = await mount(state);
  try {
    toggle("Select 2026-02-01"); toggle("Select 2026-02-02"); click("Prepare remaining staff as present");
    const unload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    click("Save changed days");
    await waitFor(() => expect(labelled("Review day 2026-02-01").textContent).toContain("Draft"));
    expect(state.mock.lastCall?.[0]).toEqual({ dirty: true, busy: true });
    expect(labelled<HTMLSelectElement>("Attendance company").disabled).toBe(true);
    expect(labelled<HTMLInputElement>("Attendance month").disabled).toBe(true);
    expect(button("Save changed days").disabled).toBe(true);
    release();
    await waitFor(() => expect(document.body.textContent).toContain("2 of 2 changed days saved"));
    expect(state.mock.lastCall?.[0]).toEqual({ dirty: false, busy: false });
  } finally { release(); cleanup(); }
});

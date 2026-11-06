// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import AttendanceEntry, { prepareLeaveEntry, type EntryMode, type EntryRow } from "./AttendanceEntry";
import { DailyEditor } from "@/pages/AttendanceApp";
import { indiaToday } from "@/lib/finance";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });
const enter = (label: string, value: string) => act(() => {
  const element = document.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event("change", { bubbles: true }));
});
const click = (text: string) => act(() => Array.from(document.querySelectorAll("button")).find(button => button.textContent === text)!.click());
function mount(content: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  document.body.innerHTML = '<div id="root"></div>'; const root = createRoot(document.getElementById("root")!);
  act(() => root.render(<QueryClientProvider client={qc}>{content}</QueryClientProvider>));
  return () => { act(() => root.unmount()); qc.clear(); };
}
it("completes unmarked staff without changing existing leave or overtime", () => {
  const rows: EntryRow[] = ["Unmarked", "Paid leave", "Unpaid leave", "Half-day", "Holiday", "Weekly off", "Absent", "Present"].map((status, i) => ({ assignment_id: String(i), full_name: `QA ${i}`, status: status as EntryRow["status"], overtime_hours: i === 7 ? "2.5" : "0" }));
  const original = structuredClone(rows);
  const result = prepareLeaveEntry(rows);
  expect(result[0].status).toBe("Present"); expect(result.slice(1)).toEqual(rows.slice(1)); expect(rows).toEqual(original);
});
it("keeps an approved sheet read-only and never fills its unmarked entries", () => {
  const changed = vi.fn();
  const cleanup = mount(<AttendanceEntry rows={[{ assignment_id: "a", full_name: "QA", status: "Unmarked", overtime_hours: "0" }]} mode="leave" onMode={vi.fn()} disabled onChange={changed}>Full roster</AttendanceEntry>);
  try { expect(changed).not.toHaveBeenCalled(); expect(Array.from(document.querySelectorAll("button")).every(button => button.disabled)).toBe(true); }
  finally { cleanup(); }
});
it("submits leave-only attendance from the standalone editor without approving it", async () => {
  const writes: { method: string; body: { rows: EntryRow[]; revision: number | null } }[] = [];
  const employees = [{ id: "a", full_name: "QA One", role: "Helper", shift: "General" as const }, { id: "b", full_name: "QA Two", role: "Operator", shift: "Morning" as const }];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => { const body = JSON.parse(String(init?.body)); writes.push({ method: init!.method!, body }); return new Response(JSON.stringify({ ...body, id: "sheet", revision: 1, status: "Draft" })); }));
  function View() { const [mode, setMode] = useState<EntryMode>("all"); return <DailyEditor companyId="company" day={indiaToday()} draft={{ company_name: "QA Company", employees, sheet: null }} reload={async () => undefined} entryMode={mode} onMode={setMode} />; }
  const cleanup = mount(<View />);
  try {
    click("Leave-only entry"); enter("Employee on leave", "b"); click("Add leave"); click("Save draft");
    await vi.waitFor(async () => { await act(async () => {}); expect(writes).toHaveLength(1); });
    expect(writes[0].method).toBe("PUT"); expect(writes[0].body.revision).toBeNull();
    expect(writes[0].body.rows).toEqual([
      { assignment_id: "a", status: "Present", shift: "General", overtime_hours: "0" },
      { assignment_id: "b", status: "Unpaid leave", shift: "Morning", overtime_hours: "0" },
    ]);
    expect(document.body.textContent).not.toContain("Approve day");
    click("Mark present"); expect(document.body.textContent).toContain("2 present");
  } finally { cleanup(); }
});

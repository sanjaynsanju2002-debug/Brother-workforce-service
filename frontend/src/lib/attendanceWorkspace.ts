import { apiGet } from "./api";
import { OPS } from "./operations";

export type Shift = "General" | "Morning" | "Afternoon" | "Night";
export type Status = "Unmarked" | "Present" | "Absent" | "Half-day" | "Paid leave" | "Unpaid leave" | "Leave" | "Holiday" | "Weekly off";
export type AttendanceRow = { assignment_id: string; full_name: string; role: string; shift: Shift; status: Status; overtime_hours: string };
export type AttendanceSheet = { id: string; revision: number; status: "Draft" | "Approved"; rows: AttendanceRow[]; notes: string };
export type AttendanceDraft = { company_name: string; employees: { id: string; full_name: string; role: string; shift?: Shift }[]; sheet: AttendanceSheet | null; review_warnings?: string[] };
export type WorkspaceDay = AttendanceDraft & { rows: AttendanceRow[]; notes: string; dirty: boolean; error: string; reloadRequired?: boolean };
export const attendanceStatuses: Status[] = ["Unmarked", "Present", "Unpaid leave", "Paid leave", "Half-day", "Absent", "Holiday", "Weekly off"];
export const statusCode: Record<Status, string> = { Unmarked: "·", Present: "P", Absent: "A", "Half-day": "½", "Paid leave": "PL", "Unpaid leave": "UL", Leave: "UL", Holiday: "H", "Weekly off": "WO" };
export const working = (status: Status) => status === "Present" || status === "Half-day";
export function monthDates(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  const [year, number] = month.split("-").map(Number);
  return Array.from({ length: new Date(Date.UTC(year, number, 0)).getUTCDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}
export function workspaceDay(draft: AttendanceDraft): WorkspaceDay {
  const saved = new Map(draft.sheet?.rows.map(row => [row.assignment_id, row]));
  // Approved days retain their historical roster; drafts use the exact roster for that date.
  const rows = draft.sheet?.status === "Approved" ? draft.sheet.rows : draft.employees.map(person => ({ assignment_id: person.id, full_name: person.full_name, role: person.role, shift: saved.get(person.id)?.shift ?? person.shift ?? "General", status: saved.get(person.id)?.status ?? "Unmarked", overtime_hours: saved.get(person.id)?.overtime_hours ?? "0" }));
  return { ...draft, rows: rows.map(row => ({ ...row, status: row.status === "Leave" ? "Unpaid leave" : row.status })), notes: draft.sheet?.notes ?? "", dirty: false, error: "" };
}
export async function loadAttendanceMonth(company: string, dates: string[]) {
  const result: Record<string, WorkspaceDay> = {};
  // Bound concurrency so opening a month cannot flood the attendance API.
  for (let index = 0; index < dates.length; index += 4) {
    await Promise.all(dates.slice(index, index + 4).map(async day => {
      const draft = await apiGet<AttendanceDraft>(`${OPS}/attendance?company_id=${encodeURIComponent(company)}&attendance_date=${day}`);
      result[day] = workspaceDay(draft);
    }));
  }
  return result;
}
export const canApproveDay = (day: WorkspaceDay, date: string, today: string) => !day.error && !!day.sheet && day.sheet.status === "Draft" && !day.dirty && day.rows.length > 0 && day.rows.every(row => row.status !== "Unmarked") && date <= today && (!(day.review_warnings?.length) || day.notes.trim().length >= 10);

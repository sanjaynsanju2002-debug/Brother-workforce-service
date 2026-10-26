import { ApiError } from "@/attendance/api";

const DEFAULT_API_BASE = "https://brothersworkforcesolutions.in/api";
const API_BASE = (import.meta.env.VITE_ATTENDANCE_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, "");
const EMPLOYEE_TOKEN_KEY = "bws-employee-attendance-session";

export function hasEmployeeAttendanceToken() {
  return Boolean(localStorage.getItem(EMPLOYEE_TOKEN_KEY));
}

export function setEmployeeAttendanceToken(token: string) {
  localStorage.setItem(EMPLOYEE_TOKEN_KEY, token);
}

export function clearEmployeeAttendanceToken() {
  localStorage.removeItem(EMPLOYEE_TOKEN_KEY);
}

export async function employeeAttendanceFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = localStorage.getItem(EMPLOYEE_TOKEN_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });
  if (response.status === 401 && path !== "/employee-attendance/login") {
    clearEmployeeAttendanceToken();
    window.dispatchEvent(new Event("employee-attendance-session-expired"));
  }
  return response;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers = body === undefined ? undefined : { "Content-Type": "application/json" };
  const response = await employeeAttendanceFetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new ApiError(response.status, await response.json().catch(() => null));
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const employeeGet = <T>(path: string) => request<T>("GET", path);
export const employeePost = <T>(path: string, body?: unknown) => request<T>("POST", path, body);

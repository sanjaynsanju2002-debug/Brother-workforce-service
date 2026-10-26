const DEFAULT_API_BASE = "https://brothersworkforcesolutions.in/api";
const API_BASE = (import.meta.env.VITE_ATTENDANCE_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, "");
const TOKEN_KEY = "bws-attendance-session";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`request failed with ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export function setAttendanceToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAttendanceToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function attendanceFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });
  if (response.status === 401 && path !== "/admin/attendance-login") {
    clearAttendanceToken();
    window.dispatchEvent(new Event("attendance-session-expired"));
  }
  return response;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers = body === undefined ? undefined : { "Content-Type": "application/json" };
  const response = await attendanceFetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new ApiError(response.status, await response.json().catch(() => null));
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const apiGet = <T>(path: string) => request<T>("GET", path);
export const apiPost = <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? null);
export const apiPut = <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? null);

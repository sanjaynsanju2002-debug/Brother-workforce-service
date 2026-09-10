import { apiPost } from "@/lib/api";

const SESSION_KEY = "bws_visit_recorded";

/**
 * Records one anonymous visit per browser session.
 *
 * The sessionStorage guard also neutralises React StrictMode's double-invoked effects in
 * dev, so a single page load never counts twice. Failures are swallowed: analytics must
 * never surface an error to a visitor.
 */
export function trackVisit(path: string): void {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    return; // private mode / storage blocked — skip rather than double-count
  }
  void apiPost("/visits", { path }).catch(() => undefined);
}

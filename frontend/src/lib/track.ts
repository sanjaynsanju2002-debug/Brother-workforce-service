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


type JourneyEvent = "candidate_start" | "candidate_saved" | "employer_start" | "employer_saved" | "call_click" | "whatsapp_click" | "job_view";
const recorded = new Set<JourneyEvent>();
export function trackJourney(event: JourneyEvent): void {
  if (recorded.has(event)) return;
  recorded.add(event);
  void apiPost("/journey", { event }).catch(() => undefined);
}
export function watchContactActions(): () => void {
  const listener = (event: MouseEvent) => {
    const link = event.target instanceof Element ? event.target.closest("a") : null;
    if (!link) return;
    const href = link.getAttribute("href") || "";
    if (href.startsWith("tel:")) trackJourney("call_click");
    if (href.startsWith("https://wa.me/")) trackJourney("whatsapp_click");
  };
  document.addEventListener("click", listener);
  return () => document.removeEventListener("click", listener);
}

/** Optional scroll enhancement: CSS keeps every section visible without this. */
export function watchPageReveals(): () => void {
  if (!("IntersectionObserver" in window) || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return () => {};
  let observer: IntersectionObserver | undefined;
  try {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.setAttribute("data-visible", "true");
          observer?.unobserve(entry.target);
        }
      }
    }, { threshold: .12, rootMargin: "0px 0px -40px 0px" });
    document.querySelectorAll("[data-reveal]").forEach((item) => observer!.observe(item));
  } catch {
    observer?.disconnect();
  }
  return () => observer?.disconnect();
}

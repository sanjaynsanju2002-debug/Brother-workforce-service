// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import Home from "./Home";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("starts homepage scroll observation alongside contact tracking and cleans both up", () => {
  const observed: Element[] = [];
  const disconnect = vi.fn();
  const unobserve = vi.fn();
  let reveal: IntersectionObserverCallback;
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { reveal = callback; }
    observe(item: Element) { observed.push(item); }
    unobserve = unobserve;
    disconnect = disconnect;
  });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("/jobs") || url.includes("/clients") ? [] : {}))));
  const remove = vi.spyOn(document, "removeEventListener");
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let mounted = false;
  try {
    act(() => root.render(<QueryClientProvider client={qc}><MemoryRouter><Home /></MemoryRouter></QueryClientProvider>)); mounted = true;
    expect(observed.length).toBeGreaterThan(30);
    const title = host.querySelector('h2')!.closest('[data-reveal]')!;
    act(() => reveal!([{ target: title, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(title.getAttribute('data-visible')).toBe('true');
    expect(unobserve).toHaveBeenCalledWith(title);
    act(() => root.unmount()); mounted = false;
    expect(disconnect).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('click', expect.any(Function));
  } finally {
    if (mounted) act(() => root.unmount());
    qc.clear(); host.remove(); remove.mockRestore(); vi.unstubAllGlobals();
  }
});

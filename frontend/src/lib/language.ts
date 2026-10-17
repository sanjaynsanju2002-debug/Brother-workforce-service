import { useEffect, useSyncExternalStore } from "react";
import { kannada } from "@/lib/kannada";

export type SiteLanguage = "en" | "kn";
export const LANGUAGE_STORAGE_KEY = "bws-site-language";
const listeners = new Set<() => void>();
let currentLanguage: SiteLanguage = "en";
let initialized = false;

export function getSiteLanguage(): SiteLanguage {
  if (!initialized && typeof window !== "undefined") {
    initialized = true;
    try {
      currentLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "kn" ? "kn" : "en";
    } catch { /* The selector also works when browser storage is unavailable. */ }
  }
  return currentLanguage;
}

export function setSiteLanguage(language: SiteLanguage) {
  if (language !== "en" && language !== "kn") return;
  initialized = true;
  currentLanguage = language;
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* Keep the in-memory choice. */ }
  }
  if (typeof document !== "undefined") document.documentElement.lang = language;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  if (listeners.size === 0 && typeof window !== "undefined") window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

function onStorage(event: StorageEvent) {
  if (event.key !== LANGUAGE_STORAGE_KEY) return;
  initialized = true;
  currentLanguage = event.newValue === "kn" ? "kn" : "en";
  if (typeof document !== "undefined") document.documentElement.lang = currentLanguage;
  listeners.forEach((listener) => listener());
}

/** One shared choice for the public website, application forms and admin tools. */
export function useSiteLanguage(): [SiteLanguage, typeof setSiteLanguage] {
  const language = useSyncExternalStore(subscribe, getSiteLanguage, () => currentLanguage);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  return [language, setSiteLanguage];
}

export const siteLocale = () => getSiteLanguage() === "kn" ? "kn-IN" : "en-IN";
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = Object.entries(kannada)
  .filter(([key]) => /\{\d+\}/.test(key))
  .sort(([a], [b]) => b.length - a.length)
  .map(([key, value]) => ({
    value,
    slots: [...key.matchAll(/\{(\d+)\}/g)].map((match) => Number(match[1])),
    expression: new RegExp(`^${key.split(/\{\d+\}/).map(escape).join("([\\s\\S]*?)")}$`),
  }));

/** Translate display text only. Input values, API payloads and identifiers stay intact. */
export function translateText<T>(value: T, parameters?: readonly unknown[]): T {
  if (typeof value !== "string") return value;
  if (!parameters && !/[A-Za-z]/.test(value)) return value;
  let output: string = value;
  if (getSiteLanguage() === "kn") {
    const key = normalize(value);
    output = kannada[key] ?? value;
    if (output === value) {
      for (const pattern of patterns) {
        const match = pattern.expression.exec(key);
        if (!match) continue;
        const parts: unknown[] = [];
        pattern.slots.forEach((slot, index) => { parts[slot] = match[index + 1]; });
        output = pattern.value.replace(/\{(\d+)\}/g, (_, slot: string) => String(translateText(parts[Number(slot)] ?? "")));
        break;
      }
    }
    if (output !== value) output = (value.match(/^\s*/)?.[0] ?? "") + output + (value.match(/\s*$/)?.[0] ?? "");
  }
  if (parameters) output = output.replace(/\{(\d+)\}/g, (_, slot: string) => String(translateText(parameters[Number(slot)] ?? "")));
  return output as T;
}

export function usePageTitle(title: string) {
  const [language] = useSiteLanguage();
  useEffect(() => {
    const previous = document.title;
    document.title = translateText(title);
    const metadata = [...document.querySelectorAll<HTMLMetaElement>('meta[property="og:title"], meta[name="twitter:title"], meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]')]
      .map((element) => ({ element, previous: element.content }));
    metadata.forEach(({ element }) => {
      element.content = element.matches('meta[property="og:title"], meta[name="twitter:title"]') ? translateText(title) : translateText(element.content);
    });
    return () => {
      document.title = previous;
      metadata.forEach(({ element, previous: content }) => { element.content = content; });
    };
  }, [title, language]);
}

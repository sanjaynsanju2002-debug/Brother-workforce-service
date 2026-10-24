import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import "./dashboard-theme.css";

type Theme = "light" | "dark";
const STORAGE_KEY = "bws-dashboard-theme";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);

function savedTheme(): Theme {
  try { return window.localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light"; }
  catch { return "light"; }
}

/** Own the document theme only while the admin route is mounted, including portals. */
export function DashboardTheme({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(savedTheme);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = { dark: root.classList.contains("dark"), scheme: root.style.colorScheme, attribute: root.getAttribute("data-dashboard-theme") };
    return () => {
      root.classList.toggle("dark", previous.dark);
      root.style.colorScheme = previous.scheme;
      if (previous.attribute === null) root.removeAttribute("data-dashboard-theme");
      else root.setAttribute("data-dashboard-theme", previous.attribute);
    };
  }, []);
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    document.documentElement.setAttribute("data-dashboard-theme", theme);
  }, [theme]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) setTheme(event.newValue === "dark" ? "dark" : "light");
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* Private browsers may disable storage; the switch still works. */ }
  };
  return <ThemeContext.Provider value={{ theme, toggle }}><div className={`bws-dashboard${theme === "dark" ? " dark" : ""}`} data-dashboard-theme={theme}>{children}</div></ThemeContext.Provider>;
}

export function DashboardThemeToggle() {
  const context = useContext(ThemeContext);
  if (!context) return null;
  const dark = context.theme === "dark";
  return <Button type="button" variant="outline" className="flex-1 sm:flex-none" data-testid="dashboard-theme-toggle" aria-label={`Switch to ${dark ? "light" : "dark"} mode`} title={`Current theme: ${dark ? "Dark" : "Light"}`} onClick={context.toggle}>
    {dark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}<span>{dark ? "Light mode" : "Dark mode"}</span>
  </Button>;
}

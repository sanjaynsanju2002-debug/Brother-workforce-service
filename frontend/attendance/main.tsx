import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import AttendanceApp from "@/pages/AttendanceApp";
import { queryClient } from "@/lib/queryClient";
import "@/index.css";

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => registration.update());
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AttendanceApp />
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  </StrictMode>,
);

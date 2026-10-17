import { translateText, useSiteLanguage } from "@/lib/language";
import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Home from "@/pages/Home";
const Admin = lazy(() => import("@/pages/Admin"));
const JobDetail = lazy(() => import("@/pages/JobDetail"));
const Privacy = lazy(() => import("@/pages/Privacy"));

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  useSiteLanguage();
  return (
    <>
      <Suspense fallback={<p className="p-8 text-center" role="status">{translateText("Loading page…")}</p>}><Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/jobs/:jobId" element={<JobDetail />} />
        <Route path="/privacy" element={<Privacy />} />
      </Routes></Suspense>
      <Toaster position="top-right" richColors />
    </>
  );
}

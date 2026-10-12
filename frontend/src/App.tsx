import { Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Home from "@/pages/Home";
import Admin from "@/pages/Admin";
import JobDetail from "@/pages/JobDetail";
import Privacy from "@/pages/Privacy";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/jobs/:jobId" element={<JobDetail />} />
        <Route path="/privacy" element={<Privacy />} />
      </Routes>
      <Toaster position="top-right" richColors />
    </>
  );
}

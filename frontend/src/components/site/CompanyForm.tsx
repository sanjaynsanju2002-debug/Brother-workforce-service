import { translateText, useSiteLanguage } from "@/lib/language";
import React from "react";
import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, apiPost } from "@/lib/api";
import { INDUSTRIES, WORKFORCE_TYPES } from "@/lib/brand";
import type { CompanyRequest, CompanyRequestCreate } from "@/types";
import { Link } from "react-router-dom";

const EMPTY: CompanyRequestCreate = {
  company_name: "",
  contact_person: "",
  designation: "",
  mobile: "",
  email: "",
  company_location: "",
  industry: "",
  workforce_type: "",
  job_role: "",
  worker_count: "",
  shift_details: "",
  joining_date: "",
  work_location: "",
  description: "",
};

export default function CompanyForm() {
  useSiteLanguage();
  const [form, setForm] = useState<CompanyRequestCreate>(EMPTY);
  const [done, setDone] = useState(false);

  const set = (k: keyof CompanyRequestCreate, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: (payload: CompanyRequestCreate) => apiPost<CompanyRequest>("/company-requests", payload),
    onSuccess: () => {
      setDone(true);
      setForm(EMPTY);
      toast.success(translateText("Manpower request submitted"));
    },
    onError: (error) => { const detail = error instanceof ApiError ? (error.body as { detail?: unknown })?.detail : null; toast.error(translateText(typeof detail === "string" ? detail : "Could not submit your request. Please try again.")); },
  });

  if (done) {
    return (
      <div
        className="rounded-lg border border-green-200 bg-green-50 p-8 text-center"
        data-testid="manpower-request-success"
      >
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-600" />
        <p className="text-lg font-semibold text-[#0F2444]">{translateText("Thank you. Our workforce team will review your requirement and contact you to confirm the details.")}</p>
        <Button
          variant="outline"
          className="mt-5"
          onClick={() => setDone(false)}
          data-testid="manpower-request-another"
        >{translateText("Submit another request")}</Button>
      </div>
    );
  }

  return (
    <form
      className="bws-premium-form grid gap-5 sm:grid-cols-2"
      data-testid="company-manpower-request-form"
      onSubmit={(e) => {
        e.preventDefault();
        const required: (keyof CompanyRequestCreate)[] = [
          "company_name",
          "contact_person",
          "mobile",
          "company_location",
          "job_role",
          "worker_count",
        ];
        if (required.some((k) => !form[k])) {
          toast.error(translateText("Please fill all required fields"));
          return;
        }
        mutation.mutate(form);
      }}
    >
      <Field label={translateText("Company Name *")}>
        <Input
          required
          value={form.company_name}
          onChange={(e) => set("company_name", e.target.value)}
          data-testid="company-input-name"
        />
      </Field>
      <Field label={translateText("Contact Person *")}>
        <Input
          required
          value={form.contact_person}
          onChange={(e) => set("contact_person", e.target.value)}
          data-testid="company-input-contact-person"
        />
      </Field>
      <Field label={translateText("Mobile Number *")}>
        <Input
          type="tel" inputMode="tel" autoComplete="tel" pattern={String.raw`(?:[+]?91[ \-]?)?[6-9](?:[ \-]?[0-9]){9}`} title={translateText("10-digit Indian mobile number, optionally with +91")}
          required
          value={form.mobile}
          onChange={(e) => set("mobile", e.target.value)}
          data-testid="company-input-mobile"
        />
      </Field>
      <Field label={translateText("Company Location *")}>
        <Input
          required
          value={form.company_location}
          onChange={(e) => set("company_location", e.target.value)}
          data-testid="company-input-location"
        />
      </Field>
      <Field label={translateText("Required Job Role *")}>
        <Input
          required
          placeholder={translateText("e.g. Machine Operator")}
          value={form.job_role}
          onChange={(e) => set("job_role", e.target.value)}
          data-testid="company-input-job-role"
        />
      </Field>
      <Field label={translateText("Number of Workers Required *")}>
        <Input
          type="number" inputMode="numeric" min="1" max="100000" step="1"
          required
          value={form.worker_count}
          onChange={(e) => set("worker_count", e.target.value)}
          data-testid="company-input-worker-count"
        />
      </Field>
      <details className="sm:col-span-2 rounded-lg border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer font-semibold text-[#0F2444]">{translateText("Add optional details")}</summary>
        <p className="mt-2 text-sm text-slate-500">{translateText("You can also discuss these with our team after we receive your request.")}</p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <Field label={translateText("Designation")}>
            <Input value={form.designation ?? ""} onChange={(e) => set("designation", e.target.value)} data-testid="company-input-designation" />
          </Field>
          <Field label={translateText("Email")}>
            <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} data-testid="company-input-email" />
          </Field>
          <Field label={translateText("Industry")}>
            <Select value={form.industry ?? ""} onValueChange={(v: string) => set("industry", v)}>
              <SelectTrigger data-testid="company-select-industry"><SelectValue placeholder={translateText("Select industry")} /></SelectTrigger>
              <SelectContent>{INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{translateText(i)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label={translateText("Workforce Type")}>
            <Select value={form.workforce_type ?? ""} onValueChange={(v: string) => set("workforce_type", v)}>
              <SelectTrigger data-testid="company-select-workforce-type"><SelectValue placeholder={translateText("Select type")} /></SelectTrigger>
              <SelectContent>{WORKFORCE_TYPES.map((w) => <SelectItem key={w} value={w}>{translateText(w)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label={translateText("Shift Details")}>
            <Input
              placeholder={translateText("Day / Night / Rotational")}
              value={form.shift_details ?? ""}
              onChange={(e) => set("shift_details", e.target.value)}
              data-testid="company-input-shift"
            />
          </Field>
          <Field label={translateText("Expected Joining Date")}>
            <Input
              type="date"
              value={form.joining_date ?? ""}
              onChange={(e) => set("joining_date", e.target.value)}
              data-testid="company-input-joining-date"
            />
          </Field>
          <Field label={translateText("Work Location")} full>
            <Input
              value={form.work_location ?? ""}
              onChange={(e) => set("work_location", e.target.value)}
              data-testid="company-input-work-location"
            />
          </Field>
          <Field label={translateText("Requirement Description")} full>
            <Textarea
              rows={4}
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              data-testid="company-input-description"
            />
          </Field>
        </div>
      </details>

      <div className="sm:col-span-2">
        <Button
          type="submit"
          disabled={mutation.isPending}
          className="bws-btn-3d w-full bg-[#C2410C] py-6 text-base font-semibold text-white hover:bg-[#9A3412] sm:w-auto sm:px-10"
          data-testid="manpower-request-submit"
        >
          {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{translateText("Request Manpower")}</Button>
        <p className="mt-3 text-xs leading-relaxed text-slate-600">{translateText("We use your details to respond to this request. Read our ")}<Link to="/privacy" className="text-[#0F2444] underline">{translateText("Privacy Notice")}</Link>.
        </p>
      </div>
    </form>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  useSiteLanguage();
  const id = useId();
  return (
    <div className={`bws-form-field ${full ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={id} className="mb-2 block text-sm font-medium text-slate-700">{translateText(label)}</Label>
      <div id={id + "-field"}>{translateText(React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<{ id?: string }>, { id }) : children)}</div>
    </div>
  );
}

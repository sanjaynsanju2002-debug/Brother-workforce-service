import { useState } from "react";
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
import { apiPost } from "@/lib/api";
import { INDUSTRIES, WORKFORCE_TYPES } from "@/lib/brand";
import type { CompanyRequest, CompanyRequestCreate } from "@/types";

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
  const [form, setForm] = useState<CompanyRequestCreate>(EMPTY);
  const [done, setDone] = useState(false);

  const set = (k: keyof CompanyRequestCreate, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: (payload: CompanyRequestCreate) => apiPost<CompanyRequest>("/company-requests", payload),
    onSuccess: () => {
      setDone(true);
      setForm(EMPTY);
      toast.success("Manpower request submitted");
    },
    onError: () => toast.error("Could not submit your request. Please try again."),
  });

  if (done) {
    return (
      <div
        className="rounded-lg border border-green-200 bg-green-50 p-8 text-center"
        data-testid="manpower-request-success"
      >
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-600" />
        <p className="text-lg font-semibold text-[#0F2444]">
          Thank you. Our workforce team will contact you shortly.
        </p>
        <Button
          variant="outline"
          className="mt-5"
          onClick={() => setDone(false)}
          data-testid="manpower-request-another"
        >
          Submit another request
        </Button>
      </div>
    );
  }

  return (
    <form
      className="grid gap-5 sm:grid-cols-2"
      data-testid="company-manpower-request-form"
      onSubmit={(e) => {
        e.preventDefault();
        const required: (keyof CompanyRequestCreate)[] = [
          "company_name",
          "contact_person",
          "mobile",
          "email",
          "company_location",
          "industry",
          "workforce_type",
          "job_role",
          "worker_count",
        ];
        if (required.some((k) => !form[k])) {
          toast.error("Please fill all required fields");
          return;
        }
        mutation.mutate(form);
      }}
    >
      <Field label="Company Name *">
        <Input
          required
          value={form.company_name}
          onChange={(e) => set("company_name", e.target.value)}
          data-testid="company-input-name"
        />
      </Field>
      <Field label="Contact Person *">
        <Input
          required
          value={form.contact_person}
          onChange={(e) => set("contact_person", e.target.value)}
          data-testid="company-input-contact-person"
        />
      </Field>
      <Field label="Designation">
        <Input
          value={form.designation ?? ""}
          onChange={(e) => set("designation", e.target.value)}
          data-testid="company-input-designation"
        />
      </Field>
      <Field label="Mobile Number *">
        <Input
          required
          value={form.mobile}
          onChange={(e) => set("mobile", e.target.value)}
          data-testid="company-input-mobile"
        />
      </Field>
      <Field label="Email *">
        <Input
          required
          type="email"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          data-testid="company-input-email"
        />
      </Field>
      <Field label="Company Location *">
        <Input
          required
          value={form.company_location}
          onChange={(e) => set("company_location", e.target.value)}
          data-testid="company-input-location"
        />
      </Field>
      <Field label="Industry *">
        <Select value={form.industry} onValueChange={(v: string) => set("industry", v)}>
          <SelectTrigger data-testid="company-select-industry">
            <SelectValue placeholder="Select industry" />
          </SelectTrigger>
          <SelectContent>
            {INDUSTRIES.map((i) => (
              <SelectItem key={i} value={i}>
                {i}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Required Workforce Type *">
        <Select value={form.workforce_type} onValueChange={(v: string) => set("workforce_type", v)}>
          <SelectTrigger data-testid="company-select-workforce-type">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            {WORKFORCE_TYPES.map((w) => (
              <SelectItem key={w} value={w}>
                {w}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Required Job Role *">
        <Input
          required
          placeholder="e.g. Machine Operator"
          value={form.job_role}
          onChange={(e) => set("job_role", e.target.value)}
          data-testid="company-input-job-role"
        />
      </Field>
      <Field label="Number of Workers Required *">
        <Input
          required
          value={form.worker_count}
          onChange={(e) => set("worker_count", e.target.value)}
          data-testid="company-input-worker-count"
        />
      </Field>
      <Field label="Shift Details">
        <Input
          placeholder="Day / Night / Rotational"
          value={form.shift_details ?? ""}
          onChange={(e) => set("shift_details", e.target.value)}
          data-testid="company-input-shift"
        />
      </Field>
      <Field label="Expected Joining Date">
        <Input
          type="date"
          value={form.joining_date ?? ""}
          onChange={(e) => set("joining_date", e.target.value)}
          data-testid="company-input-joining-date"
        />
      </Field>
      <Field label="Work Location" full>
        <Input
          value={form.work_location ?? ""}
          onChange={(e) => set("work_location", e.target.value)}
          data-testid="company-input-work-location"
        />
      </Field>
      <Field label="Requirement Description" full>
        <Textarea
          rows={4}
          value={form.description ?? ""}
          onChange={(e) => set("description", e.target.value)}
          data-testid="company-input-description"
        />
      </Field>

      <div className="sm:col-span-2">
        <Button
          type="submit"
          disabled={mutation.isPending}
          className="w-full bg-[#EA580C] py-6 text-base font-semibold text-white transition-transform duration-150 hover:bg-[#C2410C] active:scale-98 sm:w-auto sm:px-10"
          data-testid="manpower-request-submit"
        >
          {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Request Manpower
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <Label className="mb-2 block text-sm font-medium text-slate-700">{label}</Label>
      {children}
    </div>
  );
}

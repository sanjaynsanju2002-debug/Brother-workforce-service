import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Upload } from "lucide-react";
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
import { AVAILABILITY, SKILL_CATEGORIES } from "@/lib/brand";
import type { Worker, WorkerCreate } from "@/types";

const EMPTY: WorkerCreate = {
  full_name: "",
  mobile: "",
  whatsapp: "",
  age: "",
  gender: "",
  current_location: "",
  education: "",
  experience: "",
  skill_category: "",
  skills: "",
  previous_experience: "",
  preferred_location: "",
  expected_salary: "",
  availability: "",
};

export default function WorkerForm() {
  const [form, setForm] = useState<WorkerCreate>(EMPTY);
  const [resume, setResume] = useState<File | null>(null);
  const [done, setDone] = useState(false);

  const set = (k: keyof WorkerCreate, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: async (payload: WorkerCreate) => {
      const worker = await apiPost<Worker>("/workers", payload);
      if (resume) {
        const fd = new FormData();
        fd.append("file", resume);
        const res = await fetch(`/api/workers/${worker.id}/resume`, { method: "POST", body: fd });
        if (!res.ok) throw new Error("Resume upload failed");
      }
      return worker;
    },
    onSuccess: () => {
      setDone(true);
      setForm(EMPTY);
      setResume(null);
      toast.success("Registration submitted successfully");
    },
    onError: () => toast.error("Could not submit your registration. Please try again."),
  });

  if (done) {
    return (
      <div
        className="rounded-lg border border-green-200 bg-green-50 p-8 text-center"
        data-testid="worker-registration-success"
      >
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-600" />
        <p className="text-lg font-semibold text-[#0F2444]">
          Thank you for registering. Our recruitment team will contact you when suitable opportunities are
          available.
        </p>
        <Button
          variant="outline"
          className="mt-5"
          onClick={() => setDone(false)}
          data-testid="worker-registration-another"
        >
          Register another worker
        </Button>
      </div>
    );
  }

  return (
    <form
      className="grid gap-5 sm:grid-cols-2"
      data-testid="worker-registration-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.full_name || !form.mobile || !form.current_location || !form.skill_category) {
          toast.error("Please fill all required fields");
          return;
        }
        mutation.mutate(form);
      }}
    >
      <Field label="Full Name *">
        <Input
          required
          value={form.full_name}
          onChange={(e) => set("full_name", e.target.value)}
          data-testid="worker-input-full-name"
        />
      </Field>
      <Field label="Mobile Number *">
        <Input
          required
          value={form.mobile}
          onChange={(e) => set("mobile", e.target.value)}
          data-testid="worker-input-mobile"
        />
      </Field>
      <Field label="WhatsApp Number">
        <Input
          value={form.whatsapp ?? ""}
          onChange={(e) => set("whatsapp", e.target.value)}
          data-testid="worker-input-whatsapp"
        />
      </Field>
      <Field label="Age">
        <Input value={form.age ?? ""} onChange={(e) => set("age", e.target.value)} data-testid="worker-input-age" />
      </Field>
      <Field label="Gender">
        <Select value={form.gender ?? ""} onValueChange={(v: string) => set("gender", v)}>
          <SelectTrigger data-testid="worker-select-gender">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            {["Male", "Female", "Other"].map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Current Location *">
        <Input
          required
          value={form.current_location}
          onChange={(e) => set("current_location", e.target.value)}
          data-testid="worker-input-location"
        />
      </Field>
      <Field label="Education">
        <Input
          value={form.education ?? ""}
          onChange={(e) => set("education", e.target.value)}
          data-testid="worker-input-education"
        />
      </Field>
      <Field label="Experience">
        <Input
          placeholder="e.g. 3 years"
          value={form.experience ?? ""}
          onChange={(e) => set("experience", e.target.value)}
          data-testid="worker-input-experience"
        />
      </Field>
      <Field label="Skill Category *">
        <Select value={form.skill_category} onValueChange={(v: string) => set("skill_category", v)}>
          <SelectTrigger data-testid="worker-select-skill-category">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {SKILL_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Availability">
        <Select value={form.availability ?? ""} onValueChange={(v: string) => set("availability", v)}>
          <SelectTrigger data-testid="worker-select-availability">
            <SelectValue placeholder="Select availability" />
          </SelectTrigger>
          <SelectContent>
            {AVAILABILITY.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Preferred Job Location">
        <Input
          value={form.preferred_location ?? ""}
          onChange={(e) => set("preferred_location", e.target.value)}
          data-testid="worker-input-preferred-location"
        />
      </Field>
      <Field label="Expected Salary">
        <Input
          value={form.expected_salary ?? ""}
          onChange={(e) => set("expected_salary", e.target.value)}
          data-testid="worker-input-expected-salary"
        />
      </Field>
      <Field label="Skills" full>
        <Input
          placeholder="e.g. Welding, CNC operation, forklift"
          value={form.skills ?? ""}
          onChange={(e) => set("skills", e.target.value)}
          data-testid="worker-input-skills"
        />
      </Field>
      <Field label="Previous Work Experience" full>
        <Textarea
          rows={3}
          value={form.previous_experience ?? ""}
          onChange={(e) => set("previous_experience", e.target.value)}
          data-testid="worker-input-previous-experience"
        />
      </Field>

      <div className="sm:col-span-2">
        <Label className="mb-2 block text-sm font-medium text-slate-700">Resume Upload</Label>
        <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600 transition-colors hover:border-[#EA580C]">
          <Upload className="h-4 w-4 text-[#EA580C]" />
          <span data-testid="worker-resume-name">{resume ? resume.name : "Upload PDF / DOC / image (optional)"}</span>
          <input
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            onChange={(e) => setResume(e.target.files?.[0] ?? null)}
            data-testid="worker-resume-input"
          />
        </label>
      </div>

      <div className="sm:col-span-2">
        <Button
          type="submit"
          disabled={mutation.isPending}
          className="w-full bg-[#EA580C] py-6 text-base font-semibold text-white transition-transform duration-150 hover:bg-[#C2410C] active:scale-98 sm:w-auto sm:px-10"
          data-testid="worker-registration-submit"
        >
          {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Apply Now
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

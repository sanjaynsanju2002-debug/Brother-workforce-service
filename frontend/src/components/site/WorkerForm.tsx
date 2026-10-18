import { useEffect, useRef, useState } from "react";
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
import { ApiError } from "@/lib/api";
import { AVAILABILITY, BRAND, SKILL_CATEGORIES } from "@/lib/brand";
import { candidateCopy, type CandidateLanguage } from "@/lib/candidateLanguage";
import type { Job, Worker, WorkerCreate } from "@/types";
import { Link } from "react-router-dom";
import { QUALIFICATION_SUGGESTIONS } from "@/lib/talentSearch";
import { MAX_RESUME_SIZE, RESUME_TYPES } from "@/lib/uploads";

type Receipt = Worker & { upload_token: string; application_reference: string };
const GENDER_KN: Record<string, string> = { Male: "ಪುರುಷ", Female: "ಮಹಿಳೆ", Other: "ಇತರೆ" };
const SKILL_KN: Record<string, string> = { Skilled: "ನುರಿತ", "Semi-skilled": "ಅರೆ ನುರಿತ", "General Worker": "ಸಾಮಾನ್ಯ ಕೆಲಸಗಾರ", "General Workers": "ಸಾಮಾನ್ಯ ಕೆಲಸಗಾರರು" };
const AVAILABILITY_KN: Record<string, string> = { Immediate: "ತಕ್ಷಣ", "Within 7 days": "7 ದಿನಗಳೊಳಗೆ", "Within 15 days": "15 ದಿನಗಳೊಳಗೆ", "Within 30 days": "30 ದಿನಗಳೊಳಗೆ" };

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

export default function WorkerForm({ job, language = "en" }: { job?: Job; language?: CandidateLanguage }) {
  const copy = candidateCopy[language];
  const [form, setForm] = useState<WorkerCreate>({ ...EMPTY, skill_category: job?.skill_category ?? "" });
  const [resume, setResume] = useState<File | null>(null);
  const [done, setDone] = useState(false);
  const [consent, setConsent] = useState(false);
  const [savedReceipt, setSavedReceipt] = useState<Receipt | null>(null);
  const [resumeFailed, setResumeFailed] = useState(false);
  const requestId = useRef(crypto.randomUUID());

  const dirty = !done && !!(form.full_name || form.mobile || form.current_location || form.education || form.skills || resume);
  useEffect(() => {
    if (!dirty && !resumeFailed) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, resumeFailed]);

  const upload = async (worker: Receipt) => {
    if (!resume) return;
    const fd = new FormData();
    fd.append("file", resume);
    const res = await fetch(`/api/workers/${worker.id}/resume`, {
      method: "POST", body: fd, headers: { "X-Upload-Token": worker.upload_token },
    });
    if (!res.ok) throw new Error(copy.savedWithoutResume);
  };
  const retryResume = useMutation({
    mutationFn: async () => { if (savedReceipt) await upload(savedReceipt); },
    onSuccess: () => { setResumeFailed(false); setResume(null); toast.success(copy.submitted); },
    onError: () => toast.error(copy.savedWithoutResume),
  });

  const set = (k: keyof WorkerCreate, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: async (payload: WorkerCreate) => {
      const worker = await apiPost<Receipt>("/workers", {
        ...payload, job_id: job?.id ?? null, consent_to_share: true, request_id: requestId.current,
      });
      let resumeUploaded = true;

      if (resume) {
        try { await upload(worker); } catch { resumeUploaded = false; }
      }

      return { worker, resumeUploaded };
    },
    onSuccess: ({ worker, resumeUploaded }) => {
      setSavedReceipt(worker);
      setResumeFailed(!resumeUploaded);
      setDone(true);
      setForm(EMPTY);
      if (resumeUploaded) setResume(null);
      setConsent(false);
      if (resumeUploaded) {
        toast.success(copy.submitted);
      } else {
        toast.warning(copy.savedWithoutResume);
      }
    },
    onError: (error) => {
      const detail = error instanceof ApiError ? (error.body as { detail?: unknown } | null)?.detail : null;
      toast.error(typeof detail === "string" ? detail : copy.submitError);
    },
  });

  if (done) {
    return (
      <div
        className="rounded-lg border border-green-200 bg-green-50 p-8 text-center"
        data-testid="worker-registration-success"
      >
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-600" />
        <p className="text-lg font-semibold text-[#0F2444]">
          {job ? copy.successJob : copy.successGeneral}
        </p>
        {savedReceipt && <p className="mt-3 font-semibold">{language === "kn" ? "ಅರ್ಜಿ ಸಂಖ್ಯೆ" : "Application reference"}: {savedReceipt.application_reference}</p>}
        {job && <p className="mt-2 text-sm">{job.title} · {job.location}</p>}
        <p className="mt-3 text-sm">{language === "kn" ? "ನಮ್ಮ ನೇಮಕಾತಿ ತಂಡ ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಪರಿಶೀಲಿಸಿ ಸೂಕ್ತ ಅವಕಾಶಗಳ ಬಗ್ಗೆ ಸಂಪರ್ಕಿಸುತ್ತದೆ." : "Our recruitment team will review your profile and contact you about suitable opportunities."}</p>
        {resumeFailed && <div role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <p>{copy.savedWithoutResume}</p>
          <Button type="button" className="mt-3" disabled={retryResume.isPending} onClick={() => retryResume.mutate()}>{language === "kn" ? "ಸ್ವವಿವರ ಪತ್ರವನ್ನು ಮತ್ತೆ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ" : "Retry resume upload"}</Button>
        </div>}
        <Button
          variant="outline"
          className="mt-5"
          onClick={() => { if (resumeFailed && !window.confirm("Your application is saved, but its resume has not uploaded. Start another application?")) return; setDone(false); setResumeFailed(false); setResume(null); setSavedReceipt(null); setForm({ ...EMPTY, skill_category: job?.skill_category ?? "" }); requestId.current = crypto.randomUUID(); }}
          data-testid="worker-registration-another"
        >
          {copy.another}
        </Button>
      </div>
    );
  }

  return (
    <form
      className="bws-premium-form grid gap-5 sm:grid-cols-2"
      data-testid="worker-registration-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.full_name || !form.mobile || !form.current_location || !form.skill_category) {
          toast.error(copy.requiredError);
          return;
        }
        if (!consent) {
          toast.error(copy.consentError);
          return;
        }
        mutation.mutate(form);
      }}
    >
      {job && (
        <div className="sm:col-span-2 rounded-lg border border-[#EA580C]/30 bg-orange-50 p-4 text-sm" data-testid="worker-selected-job">
          {copy.appliedFor}: <strong>{job.title}</strong> · {job.location}
        </div>
      )}
      <p className="sm:col-span-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-900">{copy.noFee}</p>
      <Field id="worker-full-name" label={copy.fullName}>
        <Input
          id="worker-full-name"
          required
          autoComplete="name"
          value={form.full_name}
          onChange={(e) => set("full_name", e.target.value)}
          data-testid="worker-input-full-name"
        />
      </Field>
      <Field id="worker-mobile" label={copy.mobile}>
        <Input
          id="worker-mobile"
          required
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          pattern={String.raw`(?:[+]?91[ \-]?)?[6-9](?:[ \-]?[0-9]){9}`}
          title="10-digit Indian mobile number, optionally with +91"
          value={form.mobile}
          onChange={(e) => set("mobile", e.target.value)}
          data-testid="worker-input-mobile"
        />
      </Field>
      <Field id="worker-location" label={copy.currentLocation}>
        <Input
          id="worker-location"
          required
          autoComplete="address-level2"
          value={form.current_location}
          onChange={(e) => set("current_location", e.target.value)}
          data-testid="worker-input-location"
        />
      </Field>
      <Field id="worker-category" label={copy.skillCategory}>
        <Select value={form.skill_category} onValueChange={(v: string) => set("skill_category", v)}>
          <SelectTrigger id="worker-category" data-testid="worker-select-skill-category">
            <SelectValue placeholder={copy.selectCategory} />
          </SelectTrigger>
          <SelectContent>
            {SKILL_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {language === "kn" ? SKILL_KN[c] || c : c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id="worker-education" label={copy.education} full>
        <Input id="worker-education" list="worker-qualification-options" maxLength={500} value={form.education ?? ""} onChange={(e) => set("education", e.target.value)} placeholder={language === "kn" ? "ಉದಾ. SSLC, PUC, ITI - ಫಿಟ್ಟರ್, ಡಿಪ್ಲೊಮಾ" : "e.g. SSLC, PUC, ITI - Fitter, Diploma, B.Com."} data-testid="worker-input-education" />
        <datalist id="worker-qualification-options">{QUALIFICATION_SUGGESTIONS.map((option) => <option key={option} value={option} />)}</datalist>
      </Field>
      <Field id="worker-skills" label={copy.skills} full>
        <Input
          id="worker-skills"
          placeholder={language === "kn" ? "ಉದಾ. ವೆಲ್ಡಿಂಗ್, ಯಂತ್ರ ನಿರ್ವಹಣೆ" : "e.g. Welding, CNC operation, customer service"}
          value={form.skills ?? ""}
          onChange={(e) => set("skills", e.target.value)}
          data-testid="worker-input-skills"
        />
      </Field>
      <div className="sm:col-span-2">
        <p className="mb-2 text-sm font-medium text-slate-700">{copy.resume} <span className="font-normal text-slate-500">(2 MB)</span></p>
        <label className="bws-upload-zone flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-600 hover:border-[#EA580C] focus-within:ring-2 focus-within:ring-orange-700">
          <Upload className="h-4 w-4 text-[#C2410C]" />
          <span data-testid="worker-resume-name">{resume ? `${resume.name} (${(resume.size / 1024 / 1024).toFixed(1)} MB)` : copy.resumeHelp}</span>
          <input
            type="file"
            className="sr-only"
            aria-label={copy.resume}
            accept={RESUME_TYPES}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              if (file && file.size > MAX_RESUME_SIZE) {
                toast.error(copy.resumeTooLarge);
                e.target.value = "";
                setResume(null);
                return;
              }
              setResume(file);
            }}
            data-testid="worker-resume-input"
          />
        </label>
      </div>

      <details className="sm:col-span-2 rounded-xl border border-slate-200 bg-white p-4" data-testid="worker-optional-details">
        <summary className="cursor-pointer font-semibold text-[#0F2444]">{copy.optionalDetails}</summary>
        <p className="mt-2 text-sm text-slate-500">{copy.optionalHelp}</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field id="worker-whatsapp" label={copy.whatsapp}>
            <Input id="worker-whatsapp" type="tel" inputMode="tel" value={form.whatsapp ?? ""} onChange={(e) => set("whatsapp", e.target.value)} data-testid="worker-input-whatsapp" />
          </Field>
          <Field id="worker-age" label={copy.age}>
            <Input id="worker-age" inputMode="numeric" value={form.age ?? ""} onChange={(e) => set("age", e.target.value)} data-testid="worker-input-age" />
          </Field>
          <Field id="worker-gender" label={copy.gender}>
            <Select value={form.gender ?? ""} onValueChange={(v: string) => set("gender", v)}>
              <SelectTrigger id="worker-gender" data-testid="worker-select-gender"><SelectValue placeholder={copy.select} /></SelectTrigger>
              <SelectContent>{["Male", "Female", "Other"].map((g) => <SelectItem key={g} value={g}>{language === "kn" ? GENDER_KN[g] : g}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field id="worker-experience" label={copy.experience}>
            <Input id="worker-experience" placeholder={language === "kn" ? "ಉದಾ. 3 ವರ್ಷ" : "e.g. 3 years"} value={form.experience ?? ""} onChange={(e) => set("experience", e.target.value)} data-testid="worker-input-experience" />
          </Field>
          <Field id="worker-availability" label={copy.availability}>
            <Select value={form.availability ?? ""} onValueChange={(v: string) => set("availability", v)}>
              <SelectTrigger id="worker-availability" data-testid="worker-select-availability"><SelectValue placeholder={copy.selectAvailability} /></SelectTrigger>
              <SelectContent>{AVAILABILITY.map((a) => <SelectItem key={a} value={a}>{language === "kn" ? AVAILABILITY_KN[a] || a : a}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field id="worker-preferred-location" label={copy.preferredLocation}>
            <Input id="worker-preferred-location" value={form.preferred_location ?? ""} onChange={(e) => set("preferred_location", e.target.value)} data-testid="worker-input-preferred-location" />
          </Field>
          <Field id="worker-expected-salary" label={copy.expectedSalary}>
            <Input id="worker-expected-salary" inputMode="numeric" value={form.expected_salary ?? ""} onChange={(e) => set("expected_salary", e.target.value)} data-testid="worker-input-expected-salary" />
          </Field>
          <Field id="worker-previous-experience" label={copy.previousExperience} full>
            <Textarea id="worker-previous-experience" rows={3} value={form.previous_experience ?? ""} onChange={(e) => set("previous_experience", e.target.value)} data-testid="worker-input-previous-experience" />
          </Field>
        </div>
      </details>

      <div className="sm:col-span-2">
        <label className="mb-4 flex items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required className="mt-1" />
          <span>{copy.consentBefore}<Link to="/privacy" onClick={(event) => { if (dirty && !window.confirm(language === "kn" ? "ಉಳಿಸದ ವಿವರಗಳನ್ನು ಬಿಟ್ಟು ಮುಂದುವರಿಯಬೇಕೇ?" : "Leave this application? Unsaved details will be lost.")) event.preventDefault(); }} className="text-[#0F2444] underline">{copy.privacy}</Link>{copy.consentAfter}</span>
        </label>
        <Button
          type="submit"
          disabled={mutation.isPending}
          className="bws-btn-3d w-full bg-[#C2410C] py-6 text-base font-semibold text-white hover:bg-[#9A3412] sm:w-auto sm:px-10"
          data-testid="worker-registration-submit"
        >
          {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {copy.applyNow}
        </Button>
        <p className="mt-4 max-w-2xl text-xs leading-relaxed text-slate-600">
          {copy.removalBefore}{" "}
          <a className="font-medium text-[#0F2444] underline underline-offset-2 hover:text-[#C2410C]" href={`mailto:${BRAND.email}`}>
            {BRAND.email}
          </a>.
        </p>
      </div>
    </form>
  );
}

function Field({ id, label, children, full }: { id: string; label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`bws-form-field ${full ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={id} className="mb-2 block text-sm font-medium text-slate-700">{label}</Label>
      {children}
    </div>
  );
}

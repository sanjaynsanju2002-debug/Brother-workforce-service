import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, MessageSquare, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { AVAILABILITY, SKILL_CATEGORIES } from "@/lib/brand";
import { waLink, workerMessage } from "@/lib/wa";
import type { Ok, Worker, WorkerCreate } from "@/types";

type TalentImportResult = {
  ok: boolean;
  imported: number;
  skipped: number;
  errors: string[];
};

const MAX_RESUME_SIZE = 5 * 1024 * 1024;
const TALENT_STATUS = ["Available", "Contacted", "Shortlisted", "Deployed", "Archived"];

const EMPTY_TALENT: WorkerCreate = {
  full_name: "",
  mobile: "",
  whatsapp: "",
  current_location: "",
  education: "",
  experience: "",
  skill_category: "Skilled",
  skills: "",
  expected_salary: "",
  availability: "Immediate",
};

async function uploadResume(workerId: string, file: File): Promise<void> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`/api/workers/${workerId}/resume`, {
    method: "POST",
    body,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const detail = data && typeof data.detail === "string" ? data.detail : "Resume upload failed";
    throw new Error(detail);
  }
}

export default function TalentBank({ pin }: { pin: string }) {
  const qc = useQueryClient();
  const q = `?pin=${encodeURIComponent(pin)}`;
  const [form, setForm] = useState<WorkerCreate>({ ...EMPTY_TALENT });
  const [resume, setResume] = useState<File | null>(null);
  const [importZip, setImportZip] = useState<File | null>(null);

  const talents = useQuery({
    queryKey: ["admin-talents", pin],
    queryFn: () => apiGet<Worker[]>(`/admin/talents${q}`),
  });

  const createTalent = useMutation({
    mutationFn: async () => {
      const created = await apiPost<Worker>(`/admin/talents${q}`, form);
      let resumeUploaded = true;
      if (resume) {
        try {
          await uploadResume(created.id, resume);
        } catch {
          resumeUploaded = false;
        }
      }
      return { created, resumeUploaded };
    },
    onSuccess: ({ resumeUploaded }) => {
      qc.invalidateQueries({ queryKey: ["admin-talents", pin] });
      qc.invalidateQueries({ queryKey: ["admin-stats", pin] });
      setForm({ ...EMPTY_TALENT });
      setResume(null);
      if (resumeUploaded) {
        toast.success("Talent added to the Talent Bank");
      } else {
        toast.warning("Talent saved, but the resume upload failed. You can upload it again below.");
      }
    },
    onError: () => toast.error("Could not add talent"),
  });

  const bulkImport = useMutation({
    mutationFn: async () => {
      if (!importZip) throw new Error("Choose a ZIP file");
      const body = new FormData();
      body.append("file", importZip);
      const res = await fetch(`/api/admin/talents/import${q}`, {
        method: "POST",
        body,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.detail || "Bulk import failed");
      }
      return data as TalentImportResult;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["admin-talents", pin] });
      setImportZip(null);
      const summary = `${result.imported} imported${result.skipped ? `, ${result.skipped} skipped` : ""}`;
      if (result.errors.length) {
        toast.warning(`${summary}. ${result.errors.length} row(s) need attention.`);
      } else {
        toast.success(summary);
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Bulk import failed"),
  });

  const updateStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) =>
      apiPatch<Worker>(`/admin/workers/${v.id}${q}`, { status: v.status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-talents", pin] });
      toast.success("Talent status updated");
    },
    onError: () => toast.error("Could not update status"),
  });

  const deleteTalent = useMutation({
    mutationFn: (id: string) => apiDelete<Ok>(`/admin/talents/${id}${q}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-talents", pin] });
      toast.success("Talent removed");
    },
    onError: () => toast.error("Could not remove talent"),
  });

  const replaceResume = async (workerId: string, file: File | null) => {
    if (!file) return;
    if (file.size > MAX_RESUME_SIZE) {
      toast.error("Resume must be 5 MB or smaller");
      return;
    }
    try {
      await uploadResume(workerId, file);
      await qc.invalidateQueries({ queryKey: ["admin-talents", pin] });
      toast.success("Resume uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Resume upload failed");
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.mobile.trim() || !form.current_location.trim()) {
      toast.error("Name, mobile number and location are required");
      return;
    }
    if (resume && resume.size > MAX_RESUME_SIZE) {
      toast.error("Resume must be 5 MB or smaller");
      return;
    }
    createTalent.mutate();
  };

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-white">
        <CardContent className="p-4 sm:p-6">
          <div className="mb-5">
            <h3 className="text-lg font-semibold text-[#0F2444]">Add Talent</h3>
            <p className="mt-1 text-sm text-slate-500">
              Add candidates you source directly. Their resumes are stored privately and can be matched to your job posts.
            </p>
          </div>

          <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="mb-2 block text-sm">Full name *</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="Candidate name"
              />
            </div>
            <div>
              <Label className="mb-2 block text-sm">Mobile number *</Label>
              <Input
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                placeholder="10-digit mobile number"
                inputMode="tel"
              />
            </div>
            <div>
              <Label className="mb-2 block text-sm">WhatsApp number</Label>
              <Input
                value={form.whatsapp ?? ""}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                placeholder="WhatsApp number"
                inputMode="tel"
              />
            </div>
            <div>
              <Label className="mb-2 block text-sm">Current location *</Label>
              <Input
                value={form.current_location}
                onChange={(e) => setForm({ ...form, current_location: e.target.value })}
                placeholder="Mysuru, Bengaluru, etc."
              />
            </div>
            <div>
              <Label className="mb-2 block text-sm">Skill category *</Label>
              <Select
                value={form.skill_category}
                onValueChange={(v: string) => setForm({ ...form, skill_category: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SKILL_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block text-sm">Skills / job role</Label>
              <Input
                value={form.skills ?? ""}
                onChange={(e) => setForm({ ...form, skills: e.target.value })}
                placeholder="Welder, CNC operator, picker/packer..."
              />
            </div>
            <div>
              <Label className="mb-2 block text-sm">Experience</Label>
              <Input
                value={form.experience ?? ""}
                onChange={(e) => setForm({ ...form, experience: e.target.value })}
                placeholder="e.g. 2 years"
              />
            </div>
            <div>
              <Label className="mb-2 block text-sm">Education</Label>
              <Input
                value={form.education ?? ""}
                onChange={(e) => setForm({ ...form, education: e.target.value })}
                placeholder="ITI, Diploma, SSLC..."
              />
            </div>
            <div>
              <Label className="mb-2 block text-sm">Expected salary</Label>
              <Input
                value={form.expected_salary ?? ""}
                onChange={(e) => setForm({ ...form, expected_salary: e.target.value })}
                placeholder="e.g. ₹18,000 / month"
              />
            </div>
            <div>
              <Label className="mb-2 block text-sm">Availability</Label>
              <Select
                value={form.availability ?? "Immediate"}
                onValueChange={(v: string) => setForm({ ...form, availability: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABILITY.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="mb-2 block text-sm">
                Resume <span className="font-normal text-slate-500">(PDF/DOC/image, maximum 5 MB)</span>
              </Label>
              <Input
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file && file.size > MAX_RESUME_SIZE) {
                    toast.error("Resume must be 5 MB or smaller");
                    e.target.value = "";
                    setResume(null);
                    return;
                  }
                  setResume(file);
                }}
              />
              {resume && (
                <p className="mt-2 text-xs text-slate-500">
                  {resume.name} · {(resume.size / 1024 / 1024).toFixed(1)} MB
                </p>
              )}
            </div>
            <div className="md:col-span-2">
              <Button
                type="submit"
                disabled={createTalent.isPending}
                className="w-full bg-[#EA580C] text-white hover:bg-[#C2410C] sm:w-auto"
              >
                {createTalent.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Add Talent
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
        <CardContent className="p-4 sm:p-6">
          <h3 className="text-base font-semibold text-[#0F2444]">Bulk Import Talents</h3>
          <p className="mt-1 text-sm text-slate-500">
            Upload a prepared ZIP package containing talents.csv and the matching resume files.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => setImportZip(e.target.files?.[0] ?? null)}
              className="sm:max-w-md"
            />
            <Button
              type="button"
              variant="outline"
              disabled={!importZip || bulkImport.isPending}
              onClick={() => bulkImport.mutate()}
              className="w-full sm:w-auto"
            >
              {bulkImport.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Import ZIP
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[#0F2444]">Talent Bank</h3>
          <p className="text-sm text-slate-500">
            {talents.data?.length ?? 0} candidate{(talents.data?.length ?? 0) === 1 ? "" : "s"} saved
          </p>
        </div>
        <a
          href={`/api/admin/export/talents.csv${q}`}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#0F2444] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A172C]"
        >
          <Download className="h-4 w-4" /> Download Spreadsheet
        </a>
      </div>

      <Card className="border-slate-200 bg-white">
        <CardContent className="p-0">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Skills</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Resume</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {talents.isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-slate-500">
                    Loading talents...
                  </TableCell>
                </TableRow>
              )}
              {!talents.isLoading && (talents.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-slate-500">
                    No talents added yet.
                  </TableCell>
                </TableRow>
              )}
              {(talents.data ?? []).map((talent) => (
                <TableRow key={talent.id}>
                  <TableCell className="font-medium text-[#0F2444]">
                    {talent.full_name}
                    {talent.experience && (
                      <span className="block text-xs font-normal text-slate-500">{talent.experience}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {talent.mobile}
                    {talent.whatsapp && talent.whatsapp !== talent.mobile && (
                      <span className="block text-xs text-slate-500">WA: {talent.whatsapp}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {talent.skills || talent.skill_category}
                    <span className="block text-xs text-slate-500">{talent.skill_category}</span>
                  </TableCell>
                  <TableCell>{talent.current_location}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      {talent.resume_filename ? (
                        <a
                          href={`/api/workers/${talent.id}/resume${q}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium text-[#EA580C] underline"
                        >
                          Download
                        </a>
                      ) : (
                        <span className="text-sm text-slate-400">No resume</span>
                      )}
                      <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                        <Upload className="h-3.5 w-3.5" />
                        {talent.resume_filename ? "Replace" : "Upload"}
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            void replaceResume(talent.id, file);
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={talent.status}
                      onValueChange={(status: string) => updateStatus.mutate({ id: talent.id, status })}
                    >
                      <SelectTrigger size="sm" className="min-w-[125px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TALENT_STATUS.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={waLink(talent.whatsapp || talent.mobile, workerMessage(talent.full_name))}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md bg-[#16A34A] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#15803D]"
                      >
                        <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                      </a>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="destructive"
                        disabled={deleteTalent.isPending}
                        onClick={() => {
                          if (window.confirm(`Remove ${talent.full_name} from the Talent Bank?`)) {
                            deleteTalent.mutate(talent.id);
                          }
                        }}
                        aria-label={`Delete ${talent.full_name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

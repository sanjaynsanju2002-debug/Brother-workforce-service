import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Loader2, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiGet, apiPost, apiPut } from "@/lib/api";
import { BRAND } from "@/lib/brand";

type Profile = { name: string; address: string; phone: string; email: string; website: string; gstin: string; payment_details: string };
type Line = { key: string; quantity: string; rate: string };
type Form = { client_name: string; client_address: string; client_gstin: string; invoice_date: string; due_date: string; billing_period: string; supplier: Profile; lines: Line[]; service_percentage: string; cgst_percentage: string | null; sgst_percentage: string | null; gst_amount: string; notes: string };
type Totals = { line_amounts: Record<string, string>; base_amount: string; service_charge: string; subtotal: string; cgst_amount: string; sgst_amount: string; gst_amount: string; total: string };
type Invoice = Omit<Form, "due_date"> & { due_date: string | null; id: string; invoice_number: string; revision: number; totals: Totals; created_at: string; updated_at: string };
type InvoicePage = { items: Invoice[]; total: number; page: number; page_size: number };

const ROWS = [
  ["skilled_men", "Skilled", "Men"], ["skilled_women", "Skilled", "Women"],
  ["semi_men", "Semi-skilled", "Men"], ["semi_women", "Semi-skilled", "Women"],
  ["unskilled_men", "Unskilled", "Men"], ["unskilled_women", "Unskilled", "Women"],
  ["overtime", "Overtime / additional work", "Units"], ["other", "Other charges", "Units"],
] as const;
const DEFAULT_PROFILE: Profile = { name: BRAND.name, address: BRAND.officeAddress, phone: BRAND.phone, email: BRAND.email, website: "brothersworkforcesolutions.in", gstin: BRAND.gst, payment_details: "" };
const money = (value: string) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(Number(value));
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function emptyForm(supplier: Profile): Form {
  return { client_name: "", client_address: "", client_gstin: "", invoice_date: today(), due_date: "", billing_period: "", supplier: { ...supplier }, lines: ROWS.map(([key]) => ({ key, quantity: "0", rate: "0" })), service_percentage: "0", cgst_percentage: "0", sgst_percentage: "0", gst_amount: "0", notes: "" };
}

function formData(form: Form) {
  return { ...form, due_date: form.due_date || null, service_percentage: form.service_percentage || "0", cgst_percentage: form.cgst_percentage === null ? null : form.cgst_percentage || "0", sgst_percentage: form.sgst_percentage === null ? null : form.sgst_percentage || "0", gst_amount: form.gst_amount || "0", lines: form.lines.map((line) => ({ ...line, quantity: line.quantity || "0", rate: line.rate || "0" })) };
}

function fromInvoice(invoice: Invoice): Form {
  const { client_name, client_address, client_gstin, invoice_date, due_date, billing_period, supplier, lines, service_percentage, cgst_percentage, sgst_percentage, gst_amount, notes } = invoice;
  return { client_name, client_address, client_gstin, invoice_date, due_date: due_date || "", billing_period, supplier: { ...supplier }, lines: lines.map((line) => ({ ...line })), service_percentage, cgst_percentage: cgst_percentage ?? null, sgst_percentage: sgst_percentage ?? null, gst_amount, notes };
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const body = error.body as { detail?: string | { msg?: string; loc?: (string | number)[] }[] } | null;
    if (typeof body?.detail === "string") return body.detail;
    if (Array.isArray(body?.detail)) return body.detail[0]?.msg || "Check the invoice inputs";
    if (error.status === 401) return "Your session expired. Sign in again.";
  }
  return "Could not complete the invoice request. Please try again.";
}

async function download(invoice: Invoice, format: "pdf" | "xlsx") {
  const response = await fetch(`/api/admin/invoices/${invoice.id}/download/${format}`);
  if (!response.ok) throw new ApiError(response.status, await response.json().catch(() => null));
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${invoice.invoice_number.replaceAll("/", "-")}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export default function Invoices() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(() => emptyForm(DEFAULT_PROFILE));
  const [saved, setSaved] = useState<Invoice | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [problem, setProblem] = useState("");
  const [previewInput, setPreviewInput] = useState(() => formData(form));
  const formRef = useRef<HTMLFormElement>(null);
  const profileApplied = useRef(false);
  const profile = useQuery({ queryKey: ["invoice-profile"], queryFn: () => apiGet<Profile>("/admin/invoices/profile"), staleTime: Infinity });
  const history = useQuery({ queryKey: ["invoices", search, page], queryFn: () => apiGet<InvoicePage>(`/admin/invoices?page=${page}&q=${encodeURIComponent(search)}`) });

  useEffect(() => {
    if (profile.data && !profileApplied.current) {
      profileApplied.current = true;
      setForm((current) => ({ ...current, supplier: profile.data }));
    }
  }, [profile.data]);
  useEffect(() => {
    const timer = window.setTimeout(() => setPreviewInput(formData(form)), 250);
    return () => window.clearTimeout(timer);
  }, [form]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const preview = useQuery({ queryKey: ["invoice-preview", previewInput], queryFn: () => apiPost<Totals>("/admin/invoices/preview", previewInput), retry: false });
  const previewCurrent = JSON.stringify(previewInput) === JSON.stringify(formData(form));
  const totals = previewCurrent ? preview.data : undefined;
  const edit = (change: Partial<Form>) => { setForm((current) => ({ ...current, ...change })); setDirty(true); setProblem(""); };
  const legacyGst = form.cgst_percentage === null && form.sgst_percentage === null;
  const editTax = (key: "cgst_percentage" | "sgst_percentage", value: string) => edit({ cgst_percentage: form.cgst_percentage ?? "0", sgst_percentage: form.sgst_percentage ?? "0", gst_amount: "0", [key]: value });
  const editLine = (key: string, field: "quantity" | "rate", value: string) => edit({ lines: form.lines.map((line) => line.key === key ? { ...line, [field]: value } : line) });
  const editSupplier = (key: keyof Profile, value: string) => edit({ supplier: { ...form.supplier, [key]: value } });

  const save = useMutation({
    mutationFn: async (format?: "pdf" | "xlsx") => {
      const body = formData(form);
      const invoice = saved
        ? await apiPut<Invoice>(`/admin/invoices/${saved.id}`, { ...body, revision: saved.revision })
        : await apiPost<Invoice>("/admin/invoices", { ...body, request_id: requestId });
      setSaved(invoice);
      setForm(fromInvoice(invoice));
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["invoices"] });
      if (format) await download(invoice, format);
      return { invoice, format };
    },
    onSuccess: ({ invoice, format }) => { setProblem(""); toast.success(format ? `${invoice.invoice_number} saved. Download started.` : `${invoice.invoice_number} saved`); },
    onError: (error) => { const message = errorMessage(error); setProblem(message); toast.error(message); },
  });
  const saveDefaults = useMutation({
    mutationFn: () => apiPut<Profile>("/admin/invoices/profile", form.supplier),
    onSuccess: (data) => { qc.setQueryData(["invoice-profile"], data); toast.success("Business and payment details saved for new invoices"); },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const saveAs = (format?: "pdf" | "xlsx") => {
    if (!formRef.current?.reportValidity()) return;
    setProblem("");
    save.mutate(format);
  };
  const changeInvoice = (invoice?: Invoice) => {
    if (dirty && !window.confirm("Discard the unsaved changes to this invoice?")) return;
    setSaved(invoice || null);
    setForm(invoice ? fromInvoice(invoice) : emptyForm(profile.data || DEFAULT_PROFILE));
    setRequestId(crypto.randomUUID());
    setDirty(false);
    setProblem("");
  };

  if (profile.isPending) return <p className="flex items-center gap-2 p-5"><Loader2 className="h-4 w-4 animate-spin" /> Loading invoice details...</p>;
  if (profile.isError) return <div role="alert" className="rounded-lg border border-red-200 bg-white p-5"><p>Could not load your invoice details.</p><Button variant="outline" className="mt-3" onClick={() => profile.refetch()}>Try again</Button></div>;

  return (
    <section className="space-y-6" data-testid="invoice-manager">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-[#0F2444]">Invoices</h1><p className="mt-1 text-sm text-slate-500">Prepare an invoice using your existing template. All amounts are in INR.</p></div>
        <Button type="button" variant="outline" onClick={() => changeInvoice()} disabled={save.isPending} data-testid="invoice-new"><Plus className="mr-2 h-4 w-4" /> New invoice</Button>
      </div>
      <form ref={formRef} onSubmit={(event) => { event.preventDefault(); saveAs(); }} className="space-y-6">
        <fieldset disabled={save.isPending} className="min-w-0 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-[#0F2444]"><FileText className="h-4 w-4 text-[#EA580C]" /> {saved?.invoice_number || "New invoice"}{dirty && <span className="text-xs font-normal text-amber-700">Unsaved changes</span>}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label htmlFor="invoice-client" className="mb-2 block">Client / company name *</Label><Input id="invoice-client" value={form.client_name} required maxLength={150} onChange={(e) => edit({ client_name: e.target.value })} data-testid="invoice-client" /></div>
              <div><Label htmlFor="invoice-period" className="mb-2 block">Billing period</Label><Input id="invoice-period" value={form.billing_period} maxLength={100} placeholder="e.g. October 2026" onChange={(e) => edit({ billing_period: e.target.value })} /></div>
              <div><Label htmlFor="invoice-date" className="mb-2 block">Invoice date *</Label><Input id="invoice-date" type="date" required disabled={!!saved} value={form.invoice_date} onChange={(e) => edit({ invoice_date: e.target.value })} /><p className="mt-1 text-xs text-slate-500">{saved ? "The date stays fixed after an invoice is numbered." : "An invoice number is assigned when you first save."}</p></div>
              <div><Label htmlFor="invoice-due" className="mb-2 block">Payment due date</Label><Input id="invoice-due" type="date" min={form.invoice_date} value={form.due_date} onChange={(e) => edit({ due_date: e.target.value })} /></div>
              <div><Label htmlFor="invoice-address" className="mb-2 block">Client address</Label><Textarea id="invoice-address" value={form.client_address} maxLength={500} onChange={(e) => edit({ client_address: e.target.value })} /></div>
              <div><Label htmlFor="invoice-gstin" className="mb-2 block">Client GSTIN</Label><Input id="invoice-gstin" value={form.client_gstin} maxLength={30} onChange={(e) => edit({ client_gstin: e.target.value })} /></div>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
            <h2 className="font-semibold text-[#0F2444]">Worker quantities and rates</h2>
            <p className="mb-4 mt-1 text-sm text-slate-500">Amount = quantity × rate for this billing period. Leave unused rows at 0. For a fixed extra charge, enter quantity 1.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[590px] text-sm" data-testid="invoice-lines"><thead className="bg-slate-50 text-left text-slate-600"><tr><th className="p-2">Description</th><th className="p-2">Men / Women</th><th className="w-28 p-2">Quantity</th><th className="w-32 p-2">Rate (INR)</th><th className="p-2 text-right">Amount</th></tr></thead>
                <tbody>{ROWS.map(([key, label, gender]) => { const line = form.lines.find((item) => item.key === key)!; return <tr key={key} className="border-b border-slate-100">
                  <td className="p-2 font-medium text-[#0F2444]">{label}</td><td className="p-2 text-slate-500">{gender}</td>
                  <td className="p-2"><Input type="number" inputMode={gender === "Units" ? "decimal" : "numeric"} min="0" max="1000000" step={gender === "Units" ? "0.01" : "1"} value={line.quantity} aria-label={`${label} ${gender} quantity`} onChange={(e) => editLine(key, "quantity", e.target.value)} data-testid={`invoice-${key}-quantity`} /></td>
                  <td className="p-2"><Input type="number" inputMode="decimal" min="0" max="1000000000" step="0.01" value={line.rate} aria-label={`${label} ${gender} rate`} onChange={(e) => editLine(key, "rate", e.target.value)} data-testid={`invoice-${key}-rate`} /></td>
                  <td className="whitespace-nowrap p-2 text-right tabular-nums">{totals ? money(totals.line_amounts[key]) : "—"}</td>
                </tr>; })}</tbody>
              </table>
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div className="space-y-4">
                <div><Label htmlFor="invoice-service" className="mb-2 block">Service charge (%)</Label><Input id="invoice-service" type="number" inputMode="decimal" min="0" max="100" step="0.01" value={form.service_percentage} onChange={(e) => edit({ service_percentage: e.target.value })} data-testid="invoice-service" /><p className="mt-1 text-xs text-slate-500">Enter 10 for 10%. Applied to worker, overtime and other charges before GST.</p></div>
                <div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label htmlFor="invoice-cgst" className="mb-2 block">CGST (%)</Label><Input id="invoice-cgst" type="number" inputMode="decimal" min="0" max="100" step="0.01" value={form.cgst_percentage ?? ""} onChange={(e) => editTax("cgst_percentage", e.target.value)} data-testid="invoice-cgst" aria-describedby="invoice-tax-help" /></div>
                    <div><Label htmlFor="invoice-sgst" className="mb-2 block">SGST (%)</Label><Input id="invoice-sgst" type="number" inputMode="decimal" min="0" max="100" step="0.01" value={form.sgst_percentage ?? ""} onChange={(e) => editTax("sgst_percentage", e.target.value)} data-testid="invoice-sgst" aria-describedby="invoice-tax-help" /></div>
                  </div>
                  <p id="invoice-tax-help" className="mt-2 text-xs text-slate-500">Enter 9 for 9%. Each tax applies to the subtotal after adding service charges.</p>
                  {legacyGst && <p className="mt-2 text-xs text-amber-700">This saved invoice has a recorded GST amount of {money(form.gst_amount)}. Enter CGST and SGST percentages to recalculate it.</p>}
                </div>
              </div>
              <div className="space-y-3 rounded-lg bg-slate-50 p-4 text-sm" aria-live="polite" data-testid="invoice-totals">
                {!totals && <p className="text-slate-500">{preview.isError && previewCurrent ? errorMessage(preview.error) : "Calculating totals..."}</p>}
                {([
                  ["Charges before service fee", "base_amount"], ["Service charge", "service_charge"], ["Subtotal before GST", "subtotal"],
                  ...(legacyGst ? [["GST (recorded amount)", "gst_amount"] as const] : [[`CGST (${form.cgst_percentage || "0"}%)`, "cgst_amount"] as const, [`SGST (${form.sgst_percentage || "0"}%)`, "sgst_amount"] as const]),
                  ["Total", "total"],
                ] as const).map(([label, key]) => <div key={key} className={`flex items-center justify-between gap-3 ${key === "total" ? "border-t border-slate-200 pt-3 text-lg font-bold text-[#0F2444]" : ""}`}><span>{label}</span><span className="tabular-nums" data-testid={`invoice-${key}`}>{totals ? money(totals[key]) : "—"}</span></div>)}
              </div>
            </div>
          </div>
          <details className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
            <summary className="cursor-pointer font-semibold text-[#0F2444]">Business and payment details</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {([ ["name", "Business name"], ["phone", "Phone"], ["email", "Email"], ["website", "Website"], ["gstin", "Business GSTIN"] ] as const).map(([key, label]) => <div key={key}><Label htmlFor={`invoice-supplier-${key}`} className="mb-2 block">{label}</Label><Input id={`invoice-supplier-${key}`} value={form.supplier[key]} required={key === "name"} maxLength={key === "gstin" ? 30 : key === "phone" ? 40 : 150} onChange={(e) => editSupplier(key, e.target.value)} /></div>)}
              <div><Label htmlFor="invoice-supplier-address" className="mb-2 block">Business address</Label><Textarea id="invoice-supplier-address" value={form.supplier.address} maxLength={500} onChange={(e) => editSupplier("address", e.target.value)} /></div>
              <div className="sm:col-span-2"><Label htmlFor="invoice-payment" className="mb-2 block">Payment details</Label><Textarea id="invoice-payment" value={form.supplier.payment_details} maxLength={800} placeholder="Account name, bank, account number, IFSC or UPI" onChange={(e) => editSupplier("payment_details", e.target.value)} /></div>
              <div className="sm:col-span-2"><Button type="button" variant="outline" disabled={saveDefaults.isPending} onClick={() => saveDefaults.mutate()}>Save these details for new invoices</Button><p className="mt-2 text-xs text-slate-500">Saved invoices retain their own business and payment details.</p></div>
            </div>
          </details>
          <div><Label htmlFor="invoice-notes" className="mb-2 block">Notes / payment terms</Label><Textarea id="invoice-notes" value={form.notes} maxLength={1000} onChange={(e) => edit({ notes: e.target.value })} /></div>
          {problem && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{problem}</p>}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" className="bg-[#EA580C] text-white hover:bg-[#C2410C]" data-testid="invoice-save">{save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save invoice</Button>
            <Button type="button" variant="outline" onClick={() => saveAs("pdf")} data-testid="invoice-download-pdf"><Download className="mr-2 h-4 w-4" /> Download PDF</Button>
            <Button type="button" variant="outline" onClick={() => saveAs("xlsx")} data-testid="invoice-download-xlsx"><Download className="mr-2 h-4 w-4" /> Download Excel</Button>
          </div>
          <p className="text-xs text-slate-500">Download buttons save the current invoice first. Excel keeps editable formulas and your original template.</p>
        </fieldset>
      </form>
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold text-[#0F2444]">Saved invoices</h2><Input className="w-full sm:max-w-xs" aria-label="Search saved invoices" placeholder="Search company or invoice number" value={search} maxLength={150} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
        {history.isPending && <p className="text-sm text-slate-500">Loading invoices...</p>}
        {history.isError && <p role="alert" className="text-sm text-red-700">Could not load saved invoices. <button type="button" className="underline" onClick={() => history.refetch()}>Try again</button></p>}
        {history.data?.items.length === 0 && <p className="text-sm text-slate-500">No invoices found.</p>}
        <div className="space-y-2">{history.data?.items.map((invoice) => <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"><div className="min-w-0"><p className="break-words font-medium text-[#0F2444]">{invoice.invoice_number} · {invoice.client_name}</p><p className="text-xs text-slate-500">{invoice.invoice_date} {invoice.billing_period && `· ${invoice.billing_period}`}</p></div><div className="flex items-center gap-3"><span className="text-sm font-semibold tabular-nums">{money(invoice.totals.total)}</span><Button type="button" variant="outline" size="sm" disabled={save.isPending} onClick={() => changeInvoice(invoice)} data-testid={`invoice-open-${invoice.id}`}>Open</Button></div></div>)}</div>
        {!!history.data?.total && <div className="mt-4 flex items-center justify-between gap-3 text-sm"><span>Page {page} of {Math.ceil(history.data.total / 50)} · {history.data.total} invoices</span><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button type="button" variant="outline" size="sm" disabled={page * 50 >= history.data.total} onClick={() => setPage(page + 1)}>Next</Button></div></div>}
      </div>
    </section>
  );
}

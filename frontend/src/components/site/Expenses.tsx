import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiDelete, apiGet } from "@/lib/api";
import { indiaToday, monthDate, monthLabel, rupees, type Expense, type ExpensePage } from "@/lib/finance";

const MAX_BILL_BYTES = 5 * 1024 * 1024;
const blank = (month: string) => ({ expense_date: monthDate(month), description: "", amount: "" });
const message = (error: unknown) => {
  const detail = error instanceof ApiError ? (error.body as { detail?: unknown })?.detail : null;
  return typeof detail === "string" ? detail : "Could not save the expense. Please try again.";
};

export default function Expenses() {
  const [month, setMonth] = useState(indiaToday().slice(0, 7));
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(() => blank(month));
  const [editing, setEditing] = useState<Expense | null>(null);
  const [bill, setBill] = useState<File | null>(null);
  const requestId = useRef(crypto.randomUUID());
  const fileInput = useRef<HTMLInputElement>(null);
  const formHeading = useRef<HTMLHeadingElement>(null);
  const qc = useQueryClient();
  const records = useQuery({ queryKey: ["admin-expenses", month, page], queryFn: () => apiGet<ExpensePage>(`/admin/expenses?month=${month}&page=${page}`) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-expenses"] });
    void qc.invalidateQueries({ queryKey: ["admin-profit-loss"] });
  };
  const reset = (nextMonth = month) => {
    setForm(blank(nextMonth)); setEditing(null); setBill(null);
    requestId.current = crypto.randomUUID();
    if (fileInput.current) fileInput.current.value = "";
  };
  const save = useMutation({
    mutationFn: async () => {
      const body = new FormData();
      Object.entries(form).forEach(([key, value]) => body.set(key, value));
      if (bill) body.set("file", bill);
      if (editing) body.set("revision", String(editing.revision));
      else body.set("request_id", requestId.current);
      const response = await fetch(editing ? `/api/admin/expenses/${editing.id}` : "/api/admin/expenses", { method: editing ? "PUT" : "POST", body });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new ApiError(response.status, result);
      return result as Expense;
    },
    onSuccess: () => { toast.success(editing ? "Expense updated" : "Expense saved"); reset(); setPage(1); refresh(); },
    onError: (error) => { toast.error(message(error)); if (error instanceof ApiError && error.status === 409) refresh(); },
  });
  const remove = useMutation({
    mutationFn: (expense: Expense) => apiDelete(`/admin/expenses/${expense.id}?revision=${expense.revision}`),
    onSuccess: (_, expense) => { if (editing?.id === expense.id) reset(); toast.success("Expense deleted"); setPage(1); refresh(); },
    onError: (error) => { toast.error(message(error)); refresh(); },
  });
  const busy = save.isPending || remove.isPending;
  const monthEnd = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();

  return (
    <section className="space-y-6 text-[#0F2444]" data-testid="expenses-panel">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-2xl font-bold">Expenses</h1><p className="mt-1 text-sm text-slate-600">Add your business expenses and keep their bills together by month.</p></div>
        <div><Label htmlFor="expenses-month" className="mb-2 block">Month</Label><Input id="expenses-month" type="month" value={month} disabled={busy} onChange={(e) => {
          const next = e.target.value;
          if (!next) return;
          if ((editing || form.description || form.amount || bill) && !window.confirm("Discard the unsaved expense and change month?")) return;
          setMonth(next); setPage(1); reset(next);
        }} data-testid="expenses-month" /></div>
      </div>

      <div className="rounded-xl bg-[#0F2444] p-6 text-white"><p className="text-sm text-slate-200">Total expenses · {monthLabel(month)}</p><p className="mt-2 break-words text-3xl font-bold" data-testid="expenses-total">{records.isPending ? "Loading…" : records.isError ? "Unavailable" : rupees(records.data?.total_amount ?? "0")}</p>{records.data && <p className="mt-2 text-sm text-slate-300">{records.data.total} expense{records.data.total === 1 ? "" : "s"}</p>}</div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 ref={formHeading} tabIndex={-1} className="text-lg font-semibold">{editing ? "Edit expense" : "Add an expense"}</h2>
        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={(e) => {
          e.preventDefault();
          if (!form.expense_date.startsWith(month + "-")) { toast.error("Choose a date in the selected month"); return; }
          save.mutate();
        }}>
          <div><Label htmlFor="expense-date" className="mb-2 block">Date *</Label><Input id="expense-date" type="date" required min={`${month}-01`} max={`${month}-${monthEnd}`} value={form.expense_date} disabled={busy} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} data-testid="expense-date" /></div>
          <div><Label htmlFor="expense-amount" className="mb-2 block">Amount (₹) *</Label><Input id="expense-amount" type="number" inputMode="decimal" min="0.01" max="9999999999.99" step="0.01" placeholder="0.00" required value={form.amount} disabled={busy} onChange={(e) => setForm({ ...form, amount: e.target.value })} data-testid="expense-amount" /></div>
          <div><Label htmlFor="expense-description" className="mb-2 block">Description *</Label><Input id="expense-description" placeholder="e.g. Office rent or travel" required maxLength={200} value={form.description} disabled={busy} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="expense-description" /></div>
          <div><Label htmlFor="expense-bill" className="mb-2 block">{editing?.bill_filename ? "Replace bill (optional)" : "Bill (optional)"}</Label><Input ref={fileInput} id="expense-bill" type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={busy} onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            if (file && (file.size === 0 || file.size > MAX_BILL_BYTES || !/\.(pdf|png|jpe?g)$/i.test(file.name))) { toast.error("Choose a PDF, JPG or PNG bill up to 5 MB"); e.target.value = ""; setBill(null); return; }
            setBill(file);
          }} data-testid="expense-bill" /><p className="mt-2 text-xs text-slate-500">PDF, JPG or PNG · up to 5 MB.{editing?.bill_filename && ` Current bill: ${editing.bill_filename}`}</p></div>
          <div className="flex flex-wrap gap-3 sm:col-span-2"><Button type="submit" disabled={busy} className="bg-[#C2410C] text-white hover:bg-[#9A3412]" data-testid="expense-save">{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{editing ? "Save changes" : "Save expense"}</Button>{editing && <Button type="button" variant="outline" disabled={busy} onClick={() => reset()}>Cancel edit</Button>}</div>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b px-5 py-4 text-lg font-semibold">Expenses for {monthLabel(month)}</h2>
        {records.isPending ? <p className="p-6" role="status">Loading expenses…</p> : records.isError ? <div className="p-6" role="alert"><p>Expenses could not be loaded.</p><Button variant="outline" className="mt-3" onClick={() => records.refetch()}>Try again</Button></div> : records.data?.items.length === 0 ? <p className="p-6 text-slate-600">No expenses recorded for this month. Add the first one above.</p> : <>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm" data-testid="expenses-table"><thead className="bg-slate-50 text-slate-600"><tr><th scope="col" className="px-5 py-3">Date</th><th scope="col" className="px-5 py-3">Description</th><th scope="col" className="px-5 py-3 text-right">Amount</th><th scope="col" className="px-5 py-3">Bill</th><th scope="col" className="px-5 py-3">Actions</th></tr></thead><tbody>{records.data?.items.map((expense) => <tr key={expense.id} className="border-t align-top"><td className="whitespace-nowrap px-5 py-4">{new Date(expense.expense_date + "T12:00:00").toLocaleDateString("en-IN")}</td><td className="min-w-40 max-w-xs break-words px-5 py-4">{expense.description}</td><td className="whitespace-nowrap px-5 py-4 text-right font-semibold">{rupees(expense.amount)}</td><td className="px-5 py-4">{expense.bill_filename ? <a href={`/api/admin/expenses/${expense.id}/bill`} download className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold text-[#C2410C] underline" aria-label={`Download bill for ${expense.description}`}><Download className="h-4 w-4" />Download</a> : <span className="text-slate-500">No bill</span>}</td><td className="px-5 py-4"><div className="flex gap-2"><Button variant="outline" size="icon" disabled={busy} aria-label={`Edit ${expense.description}`} onClick={() => {
            if ((form.description || form.amount || bill) && !window.confirm("Discard the unsaved expense and edit this one?")) return;
            setEditing(expense); setForm({ expense_date: expense.expense_date, description: expense.description, amount: expense.amount }); setBill(null); if (fileInput.current) fileInput.current.value = ""; formHeading.current?.focus(); formHeading.current?.scrollIntoView({ block: "center", behavior: "smooth" });
          }}><Pencil className="h-4 w-4" /></Button><Button variant="outline" size="icon" disabled={busy} aria-label={`Delete ${expense.description}`} onClick={() => { if (window.confirm(`Delete “${expense.description}” (${rupees(expense.amount)}) and its attached bill?`)) remove.mutate(expense); }}><Trash2 className="h-4 w-4 text-red-600" /></Button></div></td></tr>)}</tbody></table></div>
          {records.data && records.data.total > records.data.page_size && <div className="flex items-center justify-between gap-3 border-t p-4"><Button variant="outline" disabled={page === 1 || busy} onClick={() => setPage(page - 1)}>Previous</Button><span className="text-sm text-slate-600">Page {page} of {Math.ceil(records.data.total / records.data.page_size)}</span><Button variant="outline" disabled={page * records.data.page_size >= records.data.total || busy} onClick={() => setPage(page + 1)}>Next</Button></div>}
        </>}
      </div>
    </section>
  );
}

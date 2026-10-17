import { siteLocale } from "@/lib/language";

export const rupees = (amount: string) => new Intl.NumberFormat(siteLocale(), {
  style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(Number(amount));

export const indiaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const monthLabel = (month: string, locale = siteLocale()) => new Date(`${month}-01T12:00:00`).toLocaleDateString(locale, { month: "long", year: "numeric" });
export const monthDate = (month: string) => indiaToday().startsWith(month) ? indiaToday() : `${month}-01`;
export const previousMonth = (date: string) => {
  const [year, month] = date.slice(0, 7).split("-").map(Number);
  return month > 1 ? `${year}-${String(month - 1).padStart(2, "0")}` : `${year - 1}-12`;
};

export interface Expense {
  id: string;
  expense_date: string;
  description: string;
  amount: string;
  bill_filename: string | null;
  revision: number;
  created_at: string;
}

export interface ExpensePage {
  items: Expense[];
  month: string;
  total_amount: string;
  total: number;
  page: number;
  page_size: number;
}

export interface ProfitLoss {
  month: string;
  revenue: string;
  expenses: string;
  profit_loss: string;
  invoice_count: number;
  expense_count: number;
  unpaid_invoice_amount: string;
  unpaid_invoice_count: number;
  unassigned_invoice_count: number;
  unassigned_invoice_revenue: string;
}

export type InvoiceBillingMode = "managed_services" | "services_only";

export const INVOICE_BILLING_OPTIONS = [
  { value: "managed_services", label: "Managed services", description: "Manage wages and payroll. Invoice wages, ESI, PF, service charges and GST." },
  { value: "services_only", label: "Services only", description: "Use the entered wage amounts to calculate service charges. Invoice service charges and GST only." },
] as const;

const MANAGED_ROWS = [
  ["skilled_men", "Skilled", "Men"], ["skilled_women", "Skilled", "Women"],
  ["semi_men", "Semi-skilled", "Men"], ["semi_women", "Semi-skilled", "Women"],
  ["unskilled_men", "Unskilled", "Men"], ["unskilled_women", "Unskilled", "Women"],
  ["overtime", "Overtime / additional work", "Units"], ["other", "Other charges", "Units"],
] as const;
const SERVICE_ROWS = [["men", "Men", "Men"], ["women", "Women", "Women"]] as const;

export type InvoiceItem = { key: string; category: string; description: string; quantity: string; rate: string; amount: string | null };

export function createInvoiceItem(): InvoiceItem {
  return { key: `item_${crypto.randomUUID()}`, category: "", description: "", quantity: "1", rate: "", amount: null };
}

export function editableInvoiceItems(lines: ({ key: string; quantity: string; rate: string } & Partial<InvoiceItem>)[], amounts: Record<string, string>): InvoiceItem[] {
  const labels = new Map<string, readonly [string, string]>([...MANAGED_ROWS, ...SERVICE_ROWS].map(([key, category, detail]) => [key, [category, detail]]));
  const items = lines.filter((line) => line.key.startsWith("item_") || Number(line.quantity) > 0 || Number(amounts[line.key]) > 0).map((line) => {
    if (line.key.startsWith("item_")) return { ...line, category: line.category ?? "", description: line.description ?? "", amount: line.amount ?? null };
    const [category, detail] = labels.get(line.key) ?? ["", ""];
    return {
      key: `item_${line.key}`, category, description: detail === "Units" ? category : `${category} · ${detail}`,
      quantity: line.quantity, rate: line.rate, amount: amounts[line.key] ?? null,
    };
  });
  return items.length ? items : [createInvoiceItem()];
}

export function invoiceBillingLabel(mode: InvoiceBillingMode = "managed_services") {
  return INVOICE_BILLING_OPTIONS.find((option) => option.value === mode)!.label;
}

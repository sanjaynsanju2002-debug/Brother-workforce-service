export type InvoiceBillingMode = "managed_services" | "services_only";

export const INVOICE_BILLING_OPTIONS = [
  { value: "managed_services", label: "Managed services", description: "Manage wages and payroll. Invoice wages, ESI, PF, service charges and GST." },
  { value: "services_only", label: "Services only", description: "Use men's and women's wages to calculate service charges. Invoice service charges and GST only." },
] as const;

const MANAGED_ROWS = [
  ["skilled_men", "Skilled", "Men"], ["skilled_women", "Skilled", "Women"],
  ["semi_men", "Semi-skilled", "Men"], ["semi_women", "Semi-skilled", "Women"],
  ["unskilled_men", "Unskilled", "Men"], ["unskilled_women", "Unskilled", "Women"],
  ["overtime", "Overtime / additional work", "Units"], ["other", "Other charges", "Units"],
] as const;
const SERVICE_ROWS = [["men", "Men", "Men"], ["women", "Women", "Women"]] as const;

export function invoiceRows(mode: InvoiceBillingMode) {
  return mode === "services_only" ? SERVICE_ROWS : MANAGED_ROWS;
}

export function invoiceBillingLabel(mode: InvoiceBillingMode = "managed_services") {
  return INVOICE_BILLING_OPTIONS.find((option) => option.value === mode)!.label;
}

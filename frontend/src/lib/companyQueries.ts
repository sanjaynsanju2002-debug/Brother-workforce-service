import type { QueryClient } from "@tanstack/react-query";

export function refreshCompanyQueries(client: QueryClient): void {
  for (const key of ["ops", "admin-clients", "archived-companies", "admin-talents", "admin-workers", "clients", "admin-assignments", "payroll-companies", "payroll-draft", "invoice-companies", "invoices"]) {
    void client.invalidateQueries({ queryKey: [key] });
  }
}

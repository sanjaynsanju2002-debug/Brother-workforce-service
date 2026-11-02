import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiGet, apiPatch, apiPost } from "@/lib/api";
import { refreshCompanyQueries } from "@/lib/companyQueries";
import type { Client } from "@/types";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const detail = (error.body as { detail?: unknown } | null)?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const first = detail[0] as { msg?: unknown } | undefined;
      if (typeof first?.msg === "string") return first.msg;
    }
  }
  return "Could not update the company";
}

function editableCompany(company: Client): Client {
  return {
    ...company,
    billing_address: company.billing_address ?? company.location ?? "",
    gstin: company.gstin ?? "",
  };
}

function BillingSummary({ company }: { company: Client }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="break-words font-medium text-[#0F2444]">{company.name}</span>
        {company.archived && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            Archived
          </span>
        )}
      </div>
      <div className="mt-1 space-y-0.5 text-xs text-slate-600">
        <p><span className="font-medium">GSTIN:</span> {company.gstin || "Not added"}</p>
        <p className="whitespace-pre-line break-words">
          <span className="font-medium">Billing address:</span> {company.billing_address || company.location || "Not added"}
        </p>
      </div>
    </div>
  );
}

export default function CompanyDirectory() {
  const qc = useQueryClient();
  const active = useQuery({
    queryKey: ["admin-clients", "directory"],
    queryFn: () => apiGet<Client[]>("/admin/clients"),
  });
  const archived = useQuery({
    queryKey: ["archived-companies"],
    queryFn: () => apiGet<Client[]>("/admin/clients?archived=true"),
  });
  const [editing, setEditing] = useState<Client | null>(null);

  const save = useMutation({
    mutationFn: (company: Client) => apiPatch<Client>(`/admin/clients/${company.id}`, {
      name: company.name.trim(),
      billing_address: (company.billing_address || "").trim(),
      gstin: (company.gstin || "").replace(/\s+/g, "").toUpperCase(),
    }),
    onSuccess: (company) => {
      setEditing(null);
      refreshCompanyQueries(qc);
      toast.success(`${company.name} profile saved. New invoices will use the updated billing details.`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const restore = useMutation({
    mutationFn: (id: string) => apiPost<Client>(`/admin/clients/${id}/restore`),
    onSuccess: () => {
      setEditing(null);
      refreshCompanyQueries(qc);
      toast.success("Company and its workforce restored");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const beginEditing = (company: Client) => setEditing(editableCompany(company));
  const loading = active.isPending || archived.isPending;
  const editor = editing && (
    <form
      key={editing.id}
      className="rounded-lg border border-orange-200 bg-orange-50/30 p-4"
      data-testid="company-profile-form"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(editing);
      }}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-[#0F2444]">
            Edit {editing.archived ? "archived" : "active"} company profile
          </h3>
          {editing.archived && (
            <p className="mt-1 text-xs text-slate-600">
              You can correct billing details before restoring this company.
            </p>
          )}
        </div>
      </div>
      <fieldset disabled={save.isPending} className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="shared-company-name">Company name</Label>
          <Input
            id="shared-company-name"
            required
            maxLength={150}
            value={editing.name}
            onChange={(event) => setEditing({ ...editing, name: event.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="shared-company-gstin">GSTIN</Label>
          <Input
            id="shared-company-gstin"
            maxLength={30}
            autoCapitalize="characters"
            placeholder="e.g. 29ABCDE1234F1Z5"
            value={editing.gstin || ""}
            onChange={(event) => setEditing({ ...editing, gstin: event.target.value.toUpperCase() })}
          />
          <p className="mt-1 text-xs text-slate-500">Optional. Spaces are removed when you save.</p>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="shared-company-address">Billing address</Label>
          <Textarea
            id="shared-company-address"
            rows={3}
            maxLength={2000}
            placeholder="Enter the address that should appear on new invoices"
            value={editing.billing_address || ""}
            onChange={(event) => setEditing({ ...editing, billing_address: event.target.value })}
          />
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" disabled={!editing.name.trim() || save.isPending}>
            {save.isPending ? "Saving..." : "Save profile"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  );

  return (
    <details className="rounded-xl border border-slate-200 bg-white p-5" data-testid="company-directory">
      <summary className="cursor-pointer font-semibold text-[#0F2444]">
        Company billing details &amp; archived companies
      </summary>
      <p className="mt-3 text-sm text-slate-600">
        Edit a company to add or correct its GSTIN and billing address. The same profile is used in Workforce,
        Payroll and new Invoices. Saved invoices and payroll retain their original details.
      </p>

      {(active.isError || archived.isError) && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          Could not load companies.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => { void active.refetch(); void archived.refetch(); }}
          >
            Retry
          </button>
        </p>
      )}
      {loading && <p className="mt-3 text-sm text-slate-500">Loading company profiles...</p>}

      <h3 className="mt-5 font-semibold">Active companies ({active.data?.length ?? 0})</h3>
      {!active.data?.length && !active.isPending && (
        <p className="mt-2 text-sm text-slate-500">No active companies.</p>
      )}
      <div className="mt-2 space-y-2">
        {active.data?.map((company) => (
          <div key={company.id} className="space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
              <BillingSummary company={company} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => beginEditing(company)}
                data-testid={`company-profile-edit-${company.id}`}
              >
                Edit profile
              </Button>
            </div>
            {editing?.id === company.id && !editing.archived && editor}
          </div>
        ))}
      </div>

      <h3 className="mt-5 font-semibold">Archived companies ({archived.data?.length ?? 0})</h3>
      {!archived.data?.length && !archived.isPending && (
        <p className="mt-2 text-sm text-slate-500">No archived companies.</p>
      )}
      <div className="mt-2 space-y-2">
        {archived.data?.map((company) => (
          <div key={company.id} className="space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
              <BillingSummary company={company} />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => beginEditing(company)}
                  data-testid={`archived-company-profile-edit-${company.id}`}
                >
                  Edit profile
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={restore.isPending}
                  onClick={() => {
                    if (window.confirm(`Restore ${company.name} and its workforce assignments to the active company lists?`)) {
                      restore.mutate(company.id);
                    }
                  }}
                >
                  Restore company
                </Button>
              </div>
            </div>
            {editing?.id === company.id && editing.archived && editor}
          </div>
        ))}
      </div>
    </details>
  );
}

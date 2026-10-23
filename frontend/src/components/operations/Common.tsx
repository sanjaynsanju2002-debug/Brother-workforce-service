import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { operationError } from "@/lib/operations";

export function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="min-w-0 space-y-2"><span className="block text-sm font-medium">{label}</span>{children}</div>; }
export function Heading({ title, text, children }: { title: string; text: string; children?: ReactNode }) { return <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-bold text-[#0F2444]">{title}</h1><p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">{text}</p></div>{children}</div>; }
export function QueryStatus({ pending, error, retry }: { pending: boolean; error: unknown; retry: () => unknown }) { return pending ? <p role="status" className="p-4 text-sm text-slate-600">Loading records…</p> : error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{operationError(error)}</p><Button type="button" variant="outline" className="mt-2" onClick={retry}>Try again</Button></div> : null; }
export function Problem({ text }: { text: string }) { return text ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{text}</p> : null; }

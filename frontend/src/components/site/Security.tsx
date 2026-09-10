import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import type { SecurityInfo } from "@/types";

function apiMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { detail?: unknown } | null;
    if (body && typeof body.detail === "string") return body.detail;
  }
  return fallback;
}

export default function Security({ pin, onPinChanged }: { pin: string; onPinChanged: (p: string) => void }) {
  const qc = useQueryClient();
  const q = `?pin=${encodeURIComponent(pin)}`;
  const key = ["admin-security", pin];

  const info = useQuery({ queryKey: key, queryFn: () => apiGet<SecurityInfo>(`/admin/security${q}`) });
  const [reveal, setReveal] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const change = useMutation({
    mutationFn: (p: string) => apiPost<SecurityInfo>(`/admin/security/pin${q}`, { new_pin: p }),
    onSuccess: (d) => {
      setNewPin("");
      setConfirmPin("");
      onPinChanged(d.pin);
      qc.invalidateQueries({ queryKey: key });
      toast.success("PIN changed — use the new PIN next time you sign in");
    },
    onError: (e) => toast.error(apiMessage(e, "Could not change the PIN")),
  });

  const s = info.data;

  return (
    <div className="grid gap-6 lg:grid-cols-2" data-testid="security-panel">
      <Card className="border-slate-200 bg-white">
        <CardContent className="p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-[#0F2444]">
            <KeyRound className="h-5 w-5 text-[#EA580C]" /> Your Security PIN
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            This is the PIN that unlocks the dashboard. Keep it private — anyone with it can see every
            applicant's phone number and resume.
          </p>

          <div className="mt-5 flex items-center gap-3 rounded-md border border-slate-200 bg-[#F8FAFC] p-4">
            <span
              className="flex-1 font-mono text-2xl font-bold tracking-[0.3em] text-[#0F2444]"
              data-testid="security-pin-value"
            >
              {s ? (reveal ? s.pin : "•".repeat(s.pin.length)) : "……"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReveal((v) => !v)}
              data-testid="security-pin-reveal"
            >
              {reveal ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
              {reveal ? "Hide" : "Show"}
            </Button>
          </div>

          {s?.is_default && (
            <div
              className="mt-4 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
              data-testid="security-default-warning"
            >
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <strong>This is still the PIN we set up for you.</strong> Change it to something only your
                team knows before sharing the site publicly.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
        <CardContent className="p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-[#0F2444]">
            <ShieldCheck className="h-5 w-5 text-[#EA580C]" /> Change PIN
          </h3>
          <p className="mt-1 text-sm text-slate-500">4 to 12 digits. Takes effect immediately.</p>
          <form
            className="mt-5 space-y-4"
            data-testid="security-change-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (newPin !== confirmPin) {
                toast.error("The two PINs do not match");
                return;
              }
              if (!/^\d{4,12}$/.test(newPin)) {
                toast.error("PIN must be 4 to 12 digits");
                return;
              }
              change.mutate(newPin);
            }}
          >
            <div>
              <Label className="mb-2 block text-sm">New PIN</Label>
              <Input
                type="password"
                inputMode="numeric"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="••••••"
                data-testid="security-new-pin"
              />
            </div>
            <div>
              <Label className="mb-2 block text-sm">Confirm New PIN</Label>
              <Input
                type="password"
                inputMode="numeric"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder="••••••"
                data-testid="security-confirm-pin"
              />
            </div>
            <Button
              type="submit"
              disabled={change.isPending}
              className="bg-[#EA580C] text-white hover:bg-[#C2410C]"
              data-testid="security-change-submit"
            >
              {change.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update PIN
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

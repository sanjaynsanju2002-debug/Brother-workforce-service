import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiGet } from "@/lib/api";
import type { DayPoint } from "@/types";

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export default function TrafficChart({ pin }: { pin: string }) {
  const q = `?pin=${encodeURIComponent(pin)}&days=30`;
  const daily = useQuery({
    queryKey: ["admin-traffic-daily", pin],
    queryFn: () => apiGet<DayPoint[]>(`/admin/traffic/daily${q}`),
  });

  const data = (daily.isError ? [] : (daily.data ?? [])).map((d) => ({
    ...d,
    label: shortDate(d.date),
  }));
  const hasAny = data.some((d) => d.visits || d.applications || d.requests);

  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6" data-testid="traffic-chart">
      <h2 className="text-base font-semibold text-[#0F2444]">Last 30 Days</h2>
      <p className="mt-1 text-sm text-slate-500">
        Daily website visits against job applications and manpower requests.
      </p>

      <div className="mt-5 h-[280px] w-full">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Loading chart…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#64748B" }}
                interval="preserveStartEnd"
                minTickGap={18}
                stroke="#CBD5E1"
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748B" }} stroke="#CBD5E1" />
              <Tooltip
                contentStyle={{
                  borderRadius: 6,
                  border: "1px solid #E2E8F0",
                  fontSize: 12,
                  fontFamily: "IBM Plex Sans, sans-serif",
                }}
              />
              <Line
                type="monotone"
                dataKey="visits"
                name="Visits"
                stroke="#0F2444"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="applications"
                name="Applications"
                stroke="#EA580C"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="requests"
                name="Manpower Requests"
                stroke="#16A34A"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-5 text-xs text-slate-600">
        {[
          ["#0F2444", "Visits"],
          ["#EA580C", "Applications"],
          ["#16A34A", "Manpower Requests"],
        ].map(([color, label]) => (
          <span key={label} className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>

      {!hasAny && data.length > 0 && (
        <p className="mt-3 text-xs text-slate-500" data-testid="traffic-chart-empty">
          No activity recorded yet — the lines will fill in as people visit and apply.
        </p>
      )}
    </div>
  );
}

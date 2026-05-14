import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { useReceipts } from "@/hooks/useReceipts";
import { formatCurrency } from "@/lib/formatters";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function parseDayOfWeek(dateStr: string): number | null {
  const mIso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (mIso) {
    const d = new Date(`${mIso[1]}-${mIso[2]}-${mIso[3]}`);
    if (!isNaN(d.getTime())) return (d.getDay() + 6) % 7;
  }
  const mDe = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(dateStr);
  if (mDe) {
    const d = new Date(`${mDe[3]}-${mDe[2]}-${mDe[1]}`);
    if (!isNaN(d.getTime())) return (d.getDay() + 6) % 7;
  }
  return null;
}

export function WeekdayChart() {
  const { data: receiptsData, isLoading } = useReceipts();

  if (isLoading) return <Skeleton className="h-full w-full rounded-lg" />;

  const buckets = Array.from({ length: 7 }, (_, i) => ({ label: WEEKDAYS[i], total: 0 }));
  for (const r of receiptsData?.rows ?? []) {
    const dow = parseDayOfWeek(r.datum);
    if (dow !== null) buckets[dow]!.total += r.betrag;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={buckets} margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          dy={8}
        />
        <YAxis
          tickFormatter={(v) => formatCurrency(Number(v))}
          width={60}
          axisLine={false}
          tickLine={false}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
        />
        <Tooltip
          contentStyle={{
            borderRadius: "12px",
            border: "1px solid hsl(var(--border))",
            boxShadow: "var(--card-shadow)",
            background: "var(--surface)",
            color: "hsl(var(--foreground))",
          }}
          itemStyle={{ color: "hsl(var(--foreground))" }}
          labelStyle={{ color: "hsl(var(--foreground))" }}
          formatter={(v: number) => [formatCurrency(v), "Ausgaben"]}
        />
        <Bar dataKey="total" fill="hsl(var(--foreground))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

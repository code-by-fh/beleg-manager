import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useTopMerchants } from "@/hooks/useStats";
import { formatCurrency } from "@/lib/formatters";

export function TopMerchantsChart() {
  const { data, isLoading } = useTopMerchants();

  if (isLoading) return <Skeleton className="h-full w-full rounded-lg" />;

  const rows = (data ?? []).map((d) => ({
    ...d,
    label: d.haendler.length > 18 ? d.haendler.slice(0, 16) + "…" : d.haendler,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <XAxis
          type="number"
          axisLine={false}
          tickLine={false}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          tickFormatter={(v) => formatCurrency(Number(v))}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={100}
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
          labelFormatter={(l) => l}
        />
        <Bar dataKey="total" fill="hsl(var(--foreground))" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

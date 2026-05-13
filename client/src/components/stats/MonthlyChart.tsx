import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { useMonthly } from "@/hooks/useStats";
import { formatCurrency, formatMonthLabel } from "@/lib/formatters";

export function MonthlyChart() {
  const { data, isLoading } = useMonthly();
  return (
    <div className="h-full w-full">
      {isLoading ? (
        <Skeleton className="h-full w-full rounded-lg" />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={(data ?? []).map((d) => ({ ...d, label: formatMonthLabel(d.ym) }))}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11, fontWeight: 500 }}
              dy={10}
            />
            <YAxis
              tickFormatter={(v) => formatCurrency(Number(v))}
              width={60}
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11, fontWeight: 500 }}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '8px',
                border: '1px solid hsl(var(--border))',
                boxShadow: 'var(--card-shadow)',
                background: 'var(--surface)',
              }}
              formatter={(v: number) => [formatCurrency(v), "Ausgaben"]}
            />
            <Line
              type="monotone"
              dataKey="total"
              stroke="hsl(var(--foreground))"
              strokeWidth={2}
              dot={{ r: 3, fill: 'hsl(var(--foreground))', strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

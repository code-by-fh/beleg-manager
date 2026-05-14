import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { usePaymentMethods } from "@/hooks/useStats";
import { formatCurrency } from "@/lib/formatters";

export function PaymentMethodsChart() {
  const { data, isLoading } = usePaymentMethods();

  if (isLoading) return <Skeleton className="h-full w-full rounded-lg" />;

  const rows = (data ?? []).map((d) => ({
    ...d,
    label: d.methode.length > 14 ? d.methode.slice(0, 12) + "…" : d.methode,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
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
          formatter={(v: number, name: string) =>
            name === "total" ? [formatCurrency(v), "Ausgaben"] : [v, "Belege"]
          }
        />
        <Bar dataKey="total" fill="hsl(var(--foreground))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

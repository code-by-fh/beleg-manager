import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { useMonthly } from "@/hooks/useStats";
import { formatCurrency, formatMonthLabel } from "@/lib/formatters";

export function MonthlyChart() {
  const { data, isLoading } = useMonthly();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ausgaben pro Monat</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={(data ?? []).map((d) => ({ ...d, label: formatMonthLabel(d.ym) }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={(v) => formatCurrency(Number(v))} width={80} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

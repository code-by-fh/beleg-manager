import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useCategories } from "@/hooks/useStats";
import { formatCurrency } from "@/lib/formatters";

const COLORS = ["#0ea5e9", "#22c55e", "#a855f7", "#f97316", "#ef4444", "#14b8a6", "#eab308"];

export function CategoryDonut() {
  const { data, isLoading } = useCategories();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Aufschlüsselung nach Kategorie</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data ?? []} dataKey="total" nameKey="kategorie" innerRadius={60} outerRadius={95}>
                {(data ?? []).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

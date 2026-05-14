import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useCategories } from "@/hooks/useStats";
import { formatCurrency } from "@/lib/formatters";

const COLORS = [
  "hsl(var(--foreground))",
  "hsl(var(--foreground) / 0.7)",
  "hsl(var(--foreground) / 0.5)",
  "hsl(var(--foreground) / 0.3)",
  "hsl(var(--foreground) / 0.15)",
  "hsl(var(--foreground) / 0.85)",
  "hsl(var(--foreground) / 0.4)",
];

export function CategoryDonut() {
  const { data, isLoading } = useCategories();
  return (
    <div className="h-full w-full">
      {isLoading ? (
        <Skeleton className="h-full w-full rounded-lg" />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data ?? []}
              dataKey="total"
              nameKey="kategorie"
              innerRadius={70}
              outerRadius={100}
              stroke="none"
              paddingAngle={4}
            >
              {(data ?? []).map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: '12px',
                border: '1px solid hsl(var(--border))',
                boxShadow: 'var(--card-shadow)',
                background: 'var(--surface)',
                color: 'hsl(var(--foreground))',
              }}
              itemStyle={{ color: 'hsl(var(--foreground))' }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
              formatter={(v: number) => formatCurrency(v)}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              formatter={(v) => (
                <span className="text-[11px] font-medium text-muted-foreground">{v}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useCategories } from "@/hooks/useStats";
import { formatCurrency } from "@/lib/formatters";

const COLORS = ["#1A1A1A", "#555555", "#888888", "#AAAAAA", "#C8C8C8", "#E0E0E0", "#444444"];

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
                borderRadius: '8px',
                border: '1px solid hsl(var(--border))',
                boxShadow: 'var(--card-shadow)',
                background: 'var(--surface)',
                backdropFilter: 'none',
              }}
              formatter={(v: number) => formatCurrency(v)}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              formatter={(v) => (
                <span style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}>{v}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

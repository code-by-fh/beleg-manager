import { Skeleton } from "@/components/ui/skeleton";
import { useSummary } from "@/hooks/useStats";
import { formatCurrency } from "@/lib/formatters";

export function KpiCards() {
  const { data, isLoading } = useSummary();
  const cards = [
    { label: "Diesen Monat", value: data ? formatCurrency(data.monthTotal) : "—" },
    { label: "Dieses Jahr",  value: data ? formatCurrency(data.yearTotal)  : "—" },
    { label: "Belege gesamt", value: data ? String(data.count) : "—" },
    { label: "Top-Kategorie", value: data?.topCategory ?? "—" },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-[var(--hover-bg)] rounded-lg p-4 flex flex-col gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            {c.label}
          </span>
          {isLoading ? (
            <Skeleton className="h-8 w-24 rounded" />
          ) : (
            <span className="text-2xl font-bold text-[hsl(var(--foreground))] leading-tight">
              {c.value}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

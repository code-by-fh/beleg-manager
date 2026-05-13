import { Skeleton } from "@/components/ui/skeleton";
import { useSummary } from "@/hooks/useStats";
import { formatCurrency } from "@/lib/formatters";

function TrendBadge({ current, prev }: { current: number; prev: number }) {
  if (prev === 0) return null;
  const pct = ((current - prev) / prev) * 100;
  const up = pct >= 0;
  return (
    <span
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
        up
          ? "bg-[hsl(var(--foreground))]/8 text-[hsl(var(--foreground))]"
          : "bg-[hsl(var(--muted-foreground))]/10 text-[hsl(var(--muted-foreground))]"
      }`}
    >
      {up ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export function KpiCards() {
  const { data, isLoading } = useSummary();

  const cards = [
    {
      label: "Dieser Monat",
      value: data ? formatCurrency(data.monthTotal) : "—",
      badge: data ? <TrendBadge current={data.monthTotal} prev={data.prevMonthTotal} /> : null,
    },
    {
      label: "Vormonat",
      value: data ? formatCurrency(data.prevMonthTotal) : "—",
    },
    {
      label: "Dieses Jahr",
      value: data ? formatCurrency(data.yearTotal) : "—",
    },
    {
      label: "Belege gesamt",
      value: data ? String(data.count) : "—",
    },
    {
      label: "Ø pro Beleg",
      value: data ? formatCurrency(data.avgPerReceipt) : "—",
    },
    {
      label: "MwSt (Jahr)",
      value: data ? formatCurrency(data.mwstYear) : "—",
    },
    {
      label: "Größter Beleg",
      value: data ? formatCurrency(data.maxBetrag) : "—",
    },
    {
      label: "Top-Kategorie",
      value: data?.topCategory ?? "—",
    },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-[var(--hover-bg)] rounded-lg p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              {c.label}
            </span>
            {"badge" in c && c.badge}
          </div>
          {isLoading ? (
            <Skeleton className="h-7 w-24 rounded" />
          ) : (
            <span className="text-xl font-bold text-[hsl(var(--foreground))] leading-tight">
              {c.value}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

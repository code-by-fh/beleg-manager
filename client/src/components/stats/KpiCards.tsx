import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSummary } from "@/hooks/useStats";
import { formatCurrency } from "@/lib/formatters";

export function KpiCards() {
  const { data, isLoading } = useSummary();
  const cards = [
    { label: "Diesen Monat", value: data ? formatCurrency(data.monthTotal) : "—" },
    { label: "Dieses Jahr", value: data ? formatCurrency(data.yearTotal) : "—" },
    { label: "Belege gesamt", value: data ? String(data.count) : "—" },
    { label: "Top-Kategorie", value: data?.topCategory ?? "—" },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{c.label}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-semibold">{c.value}</div>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

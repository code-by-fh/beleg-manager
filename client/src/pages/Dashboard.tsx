import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { KpiCards } from "@/components/stats/KpiCards";
import { MonthlyChart } from "@/components/stats/MonthlyChart";
import { CategoryDonut } from "@/components/stats/CategoryDonut";
import { TopMerchantsChart } from "@/components/stats/TopMerchantsChart";
import { PaymentMethodsChart } from "@/components/stats/PaymentMethodsChart";
import { WeekdayChart } from "@/components/stats/WeekdayChart";
import { ReceiptTable } from "@/components/receipts/ReceiptTable";
import { bankApi } from "@/api/bank";

export function DashboardPage() {
  const { data: bankData } = useQuery({
    queryKey: ["bank-transactions"],
    queryFn: () => bankApi.listTransactions(),
  });
  const unmatchedCount = (bankData?.transactions ?? []).filter(
    (tx) => tx.matchStatus === "unmatched"
  ).length;

  return (
    <div className="h-full w-full flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">

        {/* Left Column (2/3) */}
        <div className="lg:col-span-2 flex flex-col gap-6">

          {/* KPIs */}
          <div className="bg-[var(--surface)] border border-[hsl(var(--border))] rounded-xl p-6 shadow-[var(--card-shadow)]">
            <h2 className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-5">Übersicht</h2>
            <KpiCards />
          </div>

          {/* Recent Receipts */}
          <div className="bg-[var(--surface)] border border-[hsl(var(--border))] rounded-xl p-6 shadow-[var(--card-shadow)] flex-1 flex flex-col min-h-[400px]">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Zuletzt erfasste Belege</h2>
              <Link
                to="/receipts"
                className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
              >
                Alle anzeigen →
              </Link>
            </div>
            <div className="flex-1 overflow-auto">
              <ReceiptTable hideFilters limit={5} />
            </div>
          </div>
        </div>

        {/* Right Column (1/3) */}
        <div className="lg:col-span-1 flex flex-col gap-6">

          {/* Categories */}
          <div className="bg-[var(--surface)] border border-[hsl(var(--border))] rounded-xl p-6 shadow-[var(--card-shadow)] flex-1">
            <h2 className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-5">Kategorien</h2>
            <div className="h-[300px]">
              <CategoryDonut />
            </div>
          </div>

          {/* Kontoabgleich status — only shown when bank data has been imported */}
          {bankData && (
            <div className="bg-[var(--surface)] border border-[hsl(var(--border))] rounded-xl p-6 shadow-[var(--card-shadow)]">
              <h2 className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-4">
                Kontoabgleich
              </h2>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Nicht zugeordnet</span>
                  <span className={`text-xl font-bold ${unmatchedCount > 0 ? "text-yellow-600" : "text-green-600"}`}>
                    {unmatchedCount}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Gesamt importiert</span>
                  <span className="text-xl font-bold">{bankData.transactions.length}</span>
                </div>
                <Link
                  to={`/kontoabgleich?tab=${unmatchedCount > 0 ? "unmatched" : "matched"}`}
                  className="mt-1 w-full text-center rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors py-2 text-sm font-medium"
                >
                  Kontoabgleich anzeigen →
                </Link>
              </div>
            </div>
          )}

          {/* Trend */}
          <div className="bg-[var(--surface)] border border-[hsl(var(--border))] rounded-xl p-6 shadow-[var(--card-shadow)]">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Trend</h2>
              <span className="text-xs text-[hsl(var(--muted-foreground))]">6 Monate</span>
            </div>
            <div className="h-[220px]">
              <MonthlyChart />
            </div>
          </div>
        </div>

      </div>

      {/* Second Row: 3 additional charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Top Merchants */}
        <div className="bg-[var(--surface)] border border-[hsl(var(--border))] rounded-xl p-6 shadow-[var(--card-shadow)]">
          <h2 className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-5">Top-Händler</h2>
          <div className="h-[220px]">
            <TopMerchantsChart />
          </div>
        </div>

        {/* Payment Methods */}
        <div className="bg-[var(--surface)] border border-[hsl(var(--border))] rounded-xl p-6 shadow-[var(--card-shadow)]">
          <h2 className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-5">Zahlungsmethoden</h2>
          <div className="h-[220px]">
            <PaymentMethodsChart />
          </div>
        </div>

        {/* Weekday Spending */}
        <div className="bg-[var(--surface)] border border-[hsl(var(--border))] rounded-xl p-6 shadow-[var(--card-shadow)]">
          <h2 className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-5">Ausgaben nach Wochentag</h2>
          <div className="h-[220px]">
            <WeekdayChart />
          </div>
        </div>

      </div>
    </div>
  );
}

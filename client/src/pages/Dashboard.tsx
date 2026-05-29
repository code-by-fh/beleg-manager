import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { KpiCards } from "@/components/stats/KpiCards";
import { MonthlyChart } from "@/components/stats/MonthlyChart";
import { CategoryDonut } from "@/components/stats/CategoryDonut";
import { TopMerchantsChart } from "@/components/stats/TopMerchantsChart";
import { PaymentMethodsChart } from "@/components/stats/PaymentMethodsChart";
import { WeekdayChart } from "@/components/stats/WeekdayChart";
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
    <div className="h-full w-full flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* Row 1: KPIs (Full Width) */}
      <div className="bg-[var(--surface)] border border-[hsl(var(--border))] rounded-2xl p-8 shadow-[var(--card-shadow)] flat-card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[10px] font-black text-[hsl(var(--muted-foreground))] uppercase tracking-[0.2em]">Finanz-Übersicht</h2>
          <div className="flex gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Live</span>
          </div>
        </div>
        <KpiCards />
      </div>

      {/* Row 2: Main Analytics (2/3 + 1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Expenditure Trend */}
        <div className="lg:col-span-2 bg-[var(--surface)] border border-[hsl(var(--border))] rounded-2xl p-8 shadow-[var(--card-shadow)] flat-card flex flex-col min-h-[450px]">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-[10px] font-black text-[hsl(var(--muted-foreground))] uppercase tracking-[0.2em] mb-1">Ausgaben-Trend</h2>
              <p className="text-xs text-muted-foreground font-medium">Verlauf der letzten 6 Monate</p>
            </div>
          </div>
          <div className="flex-1 w-full">
            <MonthlyChart />
          </div>
        </div>

        {/* Categories Donut */}
        <div className="lg:col-span-1 bg-[var(--surface)] border border-[hsl(var(--border))] rounded-2xl p-8 shadow-[var(--card-shadow)] flat-card flex flex-col min-h-[450px]">
          <h2 className="text-[10px] font-black text-[hsl(var(--muted-foreground))] uppercase tracking-[0.2em] mb-8">Kategorien</h2>
          <div className="flex-1 flex items-center justify-center">
            <CategoryDonut />
          </div>
        </div>
      </div>

      {/* Row 3: Detailed Insights (4 columns) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        
        {/* Top Merchants */}
        <div className="bg-[var(--surface)] border border-[hsl(var(--border))] rounded-2xl p-6 shadow-[var(--card-shadow)] flat-card">
          <h2 className="text-[10px] font-black text-[hsl(var(--muted-foreground))] uppercase tracking-[0.2em] mb-6">Top-Händler</h2>
          <div className="h-[200px]">
            <TopMerchantsChart />
          </div>
        </div>

        {/* Payment Methods */}
        <div className="bg-[var(--surface)] border border-[hsl(var(--border))] rounded-2xl p-6 shadow-[var(--card-shadow)] flat-card">
          <h2 className="text-[10px] font-black text-[hsl(var(--muted-foreground))] uppercase tracking-[0.2em] mb-6">Zahlungsarten</h2>
          <div className="h-[200px]">
            <PaymentMethodsChart />
          </div>
        </div>

        {/* Weekday Spending */}
        <div className="bg-[var(--surface)] border border-[hsl(var(--border))] rounded-2xl p-6 shadow-[var(--card-shadow)] flat-card">
          <h2 className="text-[10px] font-black text-[hsl(var(--muted-foreground))] uppercase tracking-[0.2em] mb-6">Aktivität</h2>
          <div className="h-[200px]">
            <WeekdayChart />
          </div>
        </div>

        {/* Bank Reconcilliation Status */}
        {bankData && (
          <div className="bg-[var(--surface)] border border-[hsl(var(--border))] rounded-2xl p-6 shadow-[var(--card-shadow)] flat-card flex flex-col">
            <h2 className="text-[10px] font-black text-[hsl(var(--muted-foreground))] uppercase tracking-[0.2em] mb-6">Kontoabgleich</h2>
            <div className="flex-1 flex flex-col justify-center gap-6">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Offen</span>
                <span className={`text-2xl font-black ${unmatchedCount > 0 ? "text-yellow-500" : "text-green-500"}`}>
                  {unmatchedCount}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Gesamt</span>
                <span className="text-2xl font-black text-foreground">{bankData.transactions.length}</span>
              </div>
              <Link
                to={`/kontoabgleich?tab=${unmatchedCount > 0 ? "unmatched" : "matched"}`}
                className="mt-2 w-full text-center rounded-xl bg-[var(--active-bg)] hover:bg-[var(--hover-bg)] transition-all py-3 text-[10px] font-black uppercase tracking-[0.15em] border border-border/40 shadow-sm"
              >
                Zuordnen →
              </Link>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

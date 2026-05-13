import { Link } from "react-router-dom";
import { KpiCards } from "@/components/stats/KpiCards";
import { MonthlyChart } from "@/components/stats/MonthlyChart";
import { CategoryDonut } from "@/components/stats/CategoryDonut";
import { ReceiptTable } from "@/components/receipts/ReceiptTable";

export function DashboardPage() {
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
                to="/review"
                className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
              >
                Alle anzeigen →
              </Link>
            </div>
            <div className="flex-1 overflow-auto">
              <ReceiptTable hideFilters />
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
    </div>
  );
}

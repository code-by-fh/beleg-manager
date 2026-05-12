import { KpiCards } from "@/components/stats/KpiCards";
import { MonthlyChart } from "@/components/stats/MonthlyChart";
import { CategoryDonut } from "@/components/stats/CategoryDonut";
import { ReceiptTable } from "@/components/receipts/ReceiptTable";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export function DashboardPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Übersicht</h1>
        <Button asChild>
          <Link to="/upload">Beleg erfassen</Link>
        </Button>
      </div>
      <KpiCards />
      <div className="grid gap-4 lg:grid-cols-2">
        <MonthlyChart />
        <CategoryDonut />
      </div>
      <ReceiptTable />
    </div>
  );
}

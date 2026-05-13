import { ReceiptTable } from "@/components/receipts/ReceiptTable";

export function ReceiptsPage() {
  return (
    <div className="h-full w-full flex flex-col gap-6">
      <div className="bg-[var(--surface)] border border-[hsl(var(--border))] rounded-xl p-6 shadow-[var(--card-shadow)] flex-1 flex flex-col min-h-[600px]">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Transaktionsliste</h2>
        </div>
        <div className="flex-1">
          <ReceiptTable />
        </div>
      </div>
    </div>
  );
}

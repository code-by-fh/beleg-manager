import { ReceiptTable } from "@/components/receipts/ReceiptTable";

export function ReceiptsPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Meine Belege</h1>
        <p className="text-[hsl(var(--muted-foreground))]">
          Verwalte und durchsuche alle deine erfassten Transaktionen.
        </p>
      </div>

      <ReceiptTable />
    </div>
  );
}

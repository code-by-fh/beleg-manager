import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReceiptTable } from "@/components/receipts/ReceiptTable";
import { FailedReceiptsSection } from "@/components/receipts/FailedReceiptsSection";
import { DriveArchiveTab } from "@/components/drive/DriveArchiveTab";

export function ReceiptsPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Meine Belege</h1>
        <p className="text-[hsl(var(--muted-foreground))]">
          Verwalte und durchsuche alle deine erfassten Transaktionen.
        </p>
      </div>

      <Tabs defaultValue="liste">
        <TabsList>
          <TabsTrigger value="liste">Liste</TabsTrigger>
          <TabsTrigger value="drive">Google Drive Archiv</TabsTrigger>
        </TabsList>
        <TabsContent value="liste" className="space-y-8 mt-4">
          <FailedReceiptsSection />
          <ReceiptTable />
        </TabsContent>
        <TabsContent value="drive" className="mt-4">
          <DriveArchiveTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

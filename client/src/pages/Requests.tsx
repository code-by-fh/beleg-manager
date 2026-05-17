import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { IncomingList } from "@/components/split-requests/IncomingList";
import { MyAufteilungenList } from "@/components/split-requests/MyAufteilungenList";
import { CreateRequestDialog } from "@/components/split-requests/CreateRequestDialog";
import { usePendingCount } from "@/hooks/useSplitRequests";

export function RequestsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const pendingCount = usePendingCount();
  const count = pendingCount.data ?? 0;

  return (
    <div className="max-w-7xl mx-auto w-full flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Aufteilungen</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Aufteilungen deiner Belege und Anforderungen anderer Nutzer
          </p>
        </div>
        <Button 
          onClick={() => setCreateOpen(true)} 
          className="flex items-center justify-center gap-2 w-full sm:w-auto shadow-sm"
        >
          <Plus size={16} />
          Neue Anforderung
        </Button>
      </div>

      <Tabs defaultValue="aufteilungen" className="w-full">
        <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
          <TabsTrigger value="aufteilungen" className="w-full sm:w-auto">
            Meine Aufteilungen
          </TabsTrigger>
          <TabsTrigger value="incoming" className="w-full sm:w-auto flex items-center justify-center gap-2">
            Eingehend
            {count > 0 && (
              <span className="ml-1 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none">
                {count}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="aufteilungen" className="mt-4 focus-visible:outline-none">
          <MyAufteilungenList />
        </TabsContent>
        <TabsContent value="incoming" className="mt-4 focus-visible:outline-none">
          <IncomingList />
        </TabsContent>
      </Tabs>
      <CreateRequestDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

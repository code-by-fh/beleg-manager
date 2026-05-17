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
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Aufteilungen & Anforderungen</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
            Aufteilungen deiner Belege und Anforderungen anderer Nutzer
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="flex items-center gap-2">
          <Plus size={16} />
          Neue Anforderung
        </Button>
      </div>
      <Tabs defaultValue="aufteilungen">
        <TabsList>
          <TabsTrigger value="aufteilungen">Meine Aufteilungen</TabsTrigger>
          <TabsTrigger value="incoming" className="flex items-center gap-2">
            Eingehend
            {count > 0 && (
              <span className="ml-1 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none">
                {count}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="aufteilungen" className="mt-4">
          <MyAufteilungenList />
        </TabsContent>
        <TabsContent value="incoming" className="mt-4">
          <IncomingList />
        </TabsContent>
      </Tabs>
      <CreateRequestDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

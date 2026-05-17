import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { useDriveInbox } from "@/hooks/useDriveInbox";
import { driveApi } from "@/api/drive";
import { AIProcessingOverlay } from "./AIProcessingOverlay";

export function DriveInbox() {
  const { data, isLoading, isError, error, refetch } = useDriveInbox();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  async function resetDrive() {
    setResetting(true);
    try {
      await driveApi.reset();
      await refetch();
      toast({ title: "Drive-Ordner zurückgesetzt" });
    } catch (e) {
      toast({ title: "Reset fehlgeschlagen", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setResetting(false);
    }
  }

  async function importFile(id: string) {
    setBusyId(id);
    try {
      const res = await driveApi.importFile(id);
      navigate(`/review/${res.pendingId}`, { state: { extraction: res.extraction, fileName: res.fileName, mimeType: res.mimeType } });
    } catch (e) {
      toast({ title: "Import fehlgeschlagen", description: String((e as Error).message) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <AIProcessingOverlay isVisible={!!busyId} />
      <Card>
        <CardHeader>
          <CardTitle>Drive-Inbox</CardTitle>
          <CardDescription>
            Lege Belege im <code>Beleg-Manager/Belege_Eingang</code> Ordner deines Drives ab. Auto-Verarbeitung läuft alle 5 Min,
            oder du importierst manuell.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : isError ? (
            <p className="text-sm text-destructive">
              Drive-Zugriff fehlgeschlagen: {(error as Error)?.message ?? "Unbekannter Fehler"}. Bitte erneut anmelden.
            </p>
          ) : (data?.files ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Dateien in der Inbox.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {data!.files.map((f) => (
                <li key={f.id} className="flex items-center justify-between p-3 gap-4">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{f.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {f.mimeType}
                      {f.status === "pending_review" && " · Bereit zum Review"}
                      {f.status === "failed" && " · Verarbeitung fehlgeschlagen"}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={f.status === "pending_review" ? "default" : "outline"}
                    disabled={busyId === f.id}
                    onClick={() => importFile(f.id)}
                  >
                    {busyId === f.id ? "..." : f.status === "pending_review" ? "Review öffnen" : "Verarbeiten"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>Aktualisieren</Button>
            <Button variant="ghost" size="sm" onClick={resetDrive} disabled={resetting}>
              {resetting ? "..." : "Drive-Ordner zurücksetzen"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

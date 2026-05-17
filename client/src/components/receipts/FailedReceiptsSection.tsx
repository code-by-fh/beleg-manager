import { AlertTriangle, RefreshCw, FileText, Mic, Pencil } from "lucide-react";
import { useFailedVoiceJobs, useRetryVoiceJob } from "@/hooks/useFailedVoiceJobs";
import { useDriveInbox } from "@/hooks/useDriveInbox";
import { driveApi } from "@/api/drive";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReceiptForm } from "./ReceiptForm";
import type { ReceiptFormValues } from "@/lib/validators";
import type { DriveInboxFile } from "@/types/receipt";

function ManualEntryDialog({
  file,
  onClose,
}: {
  file: DriveInboxFile | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function handleSubmit(values: ReceiptFormValues) {
    if (!file) return;
    setBusy(true);
    try {
      await driveApi.confirmManual(file.id, values);
      qc.invalidateQueries({ queryKey: ["driveInbox"] });
      qc.invalidateQueries({ queryKey: ["receipts"] });
      toast({ title: "Beleg manuell gespeichert" });
      onClose();
    } catch (e) {
      toast({ title: "Fehler", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const extracted = file?.extracted;

  return (
    <Dialog open={file !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Beleg manuell erfassen</DialogTitle>
        </DialogHeader>
        {file && (
          <ReceiptForm
            initial={{
              datum: extracted?.datum ?? "",
              haendler: extracted?.haendler ?? "",
              betrag: extracted?.betrag ?? 0,
              mwst: extracted?.mwst ?? 0,
              trinkgeld: 0,
              waehrung: extracted?.waehrung ?? "EUR",
              kategorie: extracted?.kategorie ?? "",
              zahlungsmethode: extracted?.zahlungsmethode ?? "",
              rechnungsnummer: "",
            }}
            busy={busy}
            onSubmit={handleSubmit}
            submitLabel="Beleg speichern"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function FailedReceiptsSection() {
  const { data: voiceData } = useFailedVoiceJobs();
  const { data: inboxData } = useDriveInbox();
  const retryVoice = useRetryVoiceJob();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [retryingDrive, setRetryingDrive] = useState<string | null>(null);
  const [manualFile, setManualFile] = useState<DriveInboxFile | null>(null);

  const failedVoice = voiceData?.jobs ?? [];
  const failedDrive = (inboxData?.files ?? []).filter((f) => f.status === "failed");
  const total = failedVoice.length + failedDrive.length;

  if (total === 0) return null;

  async function retryDrive(fileId: string) {
    setRetryingDrive(fileId);
    try {
      await driveApi.importFile(fileId);
      qc.invalidateQueries({ queryKey: ["driveInbox"] });
      qc.invalidateQueries({ queryKey: ["receipts"] });
      toast({ title: "Beleg erneut verarbeitet" });
    } catch (e) {
      toast({ title: "Fehler", description: String((e as Error).message) });
    } finally {
      setRetryingDrive(null);
    }
  }

  return (
    <>
      <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <span className="text-sm font-semibold text-red-700 dark:text-red-400">
            Fehlgeschlagene Belege ({total})
          </span>
        </div>

        <div className="space-y-2">
          {failedDrive.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-white dark:bg-white/5 px-3 py-2.5 border border-red-100 dark:border-red-900/30"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-red-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{f.name}</p>
                  <p className="text-xs text-red-500/70">Drive-Verarbeitung fehlgeschlagen</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => setManualFile(f)}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors",
                    "bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-400"
                  )}
                >
                  <Pencil className="h-3 w-3" />
                  Manuell
                </button>
                <button
                  onClick={() => retryDrive(f.id)}
                  disabled={retryingDrive === f.id}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors",
                    "bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400"
                  )}
                >
                  <RefreshCw className={cn("h-3 w-3", retryingDrive === f.id && "animate-spin")} />
                  Erneut
                </button>
              </div>
            </div>
          ))}

          {failedVoice.map((j) => (
            <div
              key={j.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-white dark:bg-white/5 px-3 py-2.5 border border-red-100 dark:border-red-900/30"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Mic className="h-4 w-4 text-red-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{j.transcript}</p>
                  <p className="text-xs text-red-500/70">{j.error}</p>
                </div>
              </div>
              <button
                onClick={() =>
                  retryVoice.mutate(j.id, {
                    onSuccess: () => toast({ title: "Beleg gespeichert" }),
                    onError: (e) => toast({ title: "Fehler", description: String((e as Error).message) }),
                  })
                }
                disabled={retryVoice.isPending}
                className={cn(
                  "flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors",
                  "bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400"
                )}
              >
                <RefreshCw className={cn("h-3 w-3", retryVoice.isPending && "animate-spin")} />
                Erneut
              </button>
            </div>
          ))}
        </div>
      </div>

      <ManualEntryDialog file={manualFile} onClose={() => setManualFile(null)} />
    </>
  );
}

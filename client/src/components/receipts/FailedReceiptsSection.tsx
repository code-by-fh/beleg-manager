import { AlertTriangle, RefreshCw, FileText, Mic } from "lucide-react";
import { useFailedVoiceJobs, useRetryVoiceJob } from "@/hooks/useFailedVoiceJobs";
import { useDriveInbox } from "@/hooks/useDriveInbox";
import { driveApi } from "@/api/drive";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function FailedReceiptsSection() {
  const { data: voiceData } = useFailedVoiceJobs();
  const { data: inboxData } = useDriveInbox();
  const retryVoice = useRetryVoiceJob();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [retryingDrive, setRetryingDrive] = useState<string | null>(null);

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
            <button
              onClick={() => retryDrive(f.id)}
              disabled={retryingDrive === f.id}
              className={cn(
                "flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors",
                "bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400"
              )}
            >
              <RefreshCw className={cn("h-3 w-3", retryingDrive === f.id && "animate-spin")} />
              Erneut
            </button>
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
  );
}

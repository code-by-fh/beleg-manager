import { AlertTriangle, RefreshCw, FileText, Mic, Pencil, Trash2, Eye } from "lucide-react";
import { useFailedVoiceJobs, useRetryVoiceJob } from "@/hooks/useFailedVoiceJobs";
import { useDriveInbox } from "@/hooks/useDriveInbox";
import { driveApi } from "@/api/drive";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { PendingReceiptResponse } from "@/types/receipt";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ReceiptForm } from "./ReceiptForm";
import type { ReceiptFormValues } from "@/lib/validators";
import type { DriveInboxFile } from "@/types/receipt";

function ManualEntryDialog({
  file,
  onClose,
  onDiscard,
}: {
  file: DriveInboxFile | null;
  onClose: () => void;
  onDiscard: (fileId: string) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [duplicate, setDuplicate] = useState<any | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleValuesChange = useCallback((values: { haendler: string; betrag: number; datum: string }) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!values.haendler || isNaN(values.betrag) || !values.datum) {
      setDuplicate(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      import("@/api/receipts").then(({ receiptsApi }) => {
        receiptsApi.checkDuplicate(values.haendler, values.betrag, values.datum)
          .then((r) => setDuplicate(r.duplicate))
          .catch(() => setDuplicate(null));
      });
    }, 400);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    setDuplicate(null);
  }, [file]);

  async function handleSubmit(values: ReceiptFormValues) {
    if (!file) return;
    setBusy(true);
    try {
      await driveApi.confirmManual(file.id, values);
      qc.invalidateQueries({ queryKey: ["drive", "inbox"] });
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto space-y-4">
        <DialogHeader>
          <DialogTitle>Beleg manuell erfassen</DialogTitle>
        </DialogHeader>
        {duplicate && (
          <div className="space-y-2">
            <div className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 dark:bg-destructive/10 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <div className="text-xs text-destructive flex-1">
                <p className="font-semibold">Duplikat erkannt: Dieser Beleg existiert bereits!</p>
                <p className="mt-0.5">
                  <strong>{duplicate.haendler}</strong> · {duplicate.betrag} {duplicate.waehrung} · {duplicate.datum}
                </p>
                <p className="mt-1 text-[10px] opacity-80">Importieren ist blockiert, um Duplikate zu verhindern.</p>
              </div>
            </div>
            <button
              onClick={() => {
                if (file) onDiscard(file.id);
              }}
              disabled={busy}
              className="w-full h-10 rounded-xl border border-destructive/20 text-destructive bg-destructive/5 hover:bg-destructive/10 font-medium text-xs transition-all duration-300 flex items-center justify-center gap-2"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Beleg verwerfen (aus Warteschlange löschen)
            </button>
          </div>
        )}
        {file && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Left side preview */}
            <div className="md:col-span-6 space-y-3">
              <div className="clay-card-static overflow-hidden rounded-[24px] p-2 bg-[var(--surface)] border border-border/40">
                <div className="relative aspect-[1/1.4] w-full overflow-hidden rounded-[18px] bg-black/5 dark:bg-white/5 flex items-center justify-center border border-border/10">
                  {file.mimeType.startsWith("image/") ? (
                    <img
                      src={`/api/drive/inbox/${file.id}/preview`}
                      alt="Beleg Vorschau"
                      className="max-h-full max-w-full object-contain select-none transition-transform duration-300 hover:scale-[1.02]"
                    />
                  ) : file.mimeType === "application/pdf" ? (
                    <iframe
                      src={`/api/drive/inbox/${file.id}/preview`}
                      className="w-full h-full rounded-[14px] border-0 animate-in fade-in"
                      title="PDF Vorschau"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground p-8">
                      <FileText className="h-10 w-10" />
                      <span className="text-xs font-medium">Beleg-Datei</span>
                    </div>
                  )}
                </div>
                <div className="p-2 text-center">
                  <a
                    href={`/api/drive/inbox/${file.id}/preview`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-primary/80 hover:text-primary transition-colors underline underline-offset-4 decoration-primary/20 hover:decoration-primary"
                  >
                    {file.mimeType === "application/pdf" ? "PDF in neuem Tab öffnen" : "Bild in neuem Tab öffnen"}
                  </a>
                </div>
              </div>
            </div>

            {/* Right side form */}
            <div className="md:col-span-6 space-y-4">
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
                onValuesChange={handleValuesChange}
                submitDisabled={!!duplicate}
                submitLabel="Beleg speichern"
              />
            </div>
          </div>
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
  const [discardFileId, setDiscardFileId] = useState<string | null>(null);
  const [manualFile, setManualFile] = useState<DriveInboxFile | null>(null);
  const [previewFile, setPreviewFile] = useState<DriveInboxFile | null>(null);

  const navigate = useNavigate();
  const retryingRef = useRef<Set<string>>(new Set());
  const resultsRef = useRef<PendingReceiptResponse[]>([]);

  const failedVoice = voiceData?.jobs ?? [];
  const failedDrive = (inboxData?.files ?? []).filter((f) => f.status === "failed");
  const total = failedVoice.length + failedDrive.length;

  if (total === 0) return null;

  async function retryDrive(fileId: string) {
    retryingRef.current.add(fileId);
    setRetryingDrive(fileId);
    try {
      const res = await driveApi.importFile(fileId);
      resultsRef.current.push(res);
      qc.invalidateQueries({ queryKey: ["drive", "inbox"] });
      qc.invalidateQueries({ queryKey: ["receipts"] });
    } catch (e) {
      toast({ title: "Fehler", description: String((e as Error).message) });
    } finally {
      retryingRef.current.delete(fileId);
      setRetryingDrive(retryingRef.current.size > 0 ? ([...retryingRef.current][0] ?? null) : null);
      if (retryingRef.current.size === 0 && resultsRef.current.length > 0) {
        const [first, ...rest] = resultsRef.current;
        resultsRef.current = [];
        if (first) {
          navigate(`/review/${first.pendingId}`, {
            state: { extraction: first.extraction, fileName: first.fileName, mimeType: first.mimeType, queue: rest },
          });
        }
      }
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
              <div
                onClick={() => setPreviewFile(f)}
                className="flex items-center gap-2 min-w-0 cursor-pointer group flex-1 hover:opacity-80"
              >
                <div className="relative flex-shrink-0">
                  <FileText className="h-4 w-4 text-red-400 transition-transform duration-200 group-hover:scale-110" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/90 dark:bg-black/90 rounded">
                    <Eye className="h-3 w-3 text-red-500" />
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate group-hover:underline decoration-red-400/40">{f.name}</p>
                  <p className="text-xs text-red-500/70 truncate max-w-[250px] sm:max-w-[400px]" title={f.error || "Drive-Verarbeitung fehlgeschlagen"}>
                    {f.error || "Drive-Verarbeitung fehlgeschlagen"}
                  </p>
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
                  disabled={retryingRef.current.has(f.id)}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors",
                    "bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400"
                  )}
                >
                  <RefreshCw className={cn("h-3 w-3", retryingRef.current.has(f.id) && "animate-spin")} />
                  Erneut
                </button>
                <button
                  onClick={() => setDiscardFileId(f.id)}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors",
                    "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                  )}
                >
                  <Trash2 className="h-3 w-3" />
                  Verwerfen
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

      <ManualEntryDialog
        file={manualFile}
        onClose={() => setManualFile(null)}
        onDiscard={(fileId) => setDiscardFileId(fileId)}
      />

      <Dialog open={discardFileId !== null} onOpenChange={(open) => { if (!open) setDiscardFileId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Beleg verwerfen</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Möchtest du diesen Beleg wirklich verwerfen und aus der Warteschlange entfernen?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-4">
            <Button variant="ghost" onClick={() => setDiscardFileId(null)} className="flex-1">
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!discardFileId) return;
                const fileId = discardFileId;
                setDiscardFileId(null);
                try {
                  await driveApi.deleteInboxFile(fileId);
                  qc.invalidateQueries({ queryKey: ["drive", "inbox"] });
                  toast({ title: "Beleg verworfen" });
                  if (manualFile?.id === fileId) {
                    setManualFile(null);
                  }
                } catch (e) {
                  toast({ title: "Fehler beim Verwerfen", description: String((e as Error).message) });
                }
              }}
              className="flex-1"
            >
              Ja, verwerfen
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={previewFile !== null} onOpenChange={(open) => { if (!open) setPreviewFile(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] p-4 flex flex-col justify-between rounded-3xl">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm font-semibold truncate pr-6">{previewFile?.name}</DialogTitle>
          </DialogHeader>
          {previewFile && (
            <div className="flex-1 min-h-0 w-full overflow-hidden flex flex-col gap-3">
              <div className="flex-1 min-h-0 w-full rounded-2xl overflow-hidden bg-black/5 dark:bg-white/5 border border-border/10 flex items-center justify-center relative aspect-[1/1.4] max-h-[60vh]">
                {previewFile.mimeType.startsWith("image/") ? (
                  <img
                    src={`/api/drive/inbox/${previewFile.id}/preview`}
                    alt="Beleg Vorschau"
                    className="max-h-full max-w-full object-contain select-none animate-in fade-in zoom-in-95 duration-200"
                  />
                ) : previewFile.mimeType === "application/pdf" ? (
                  <iframe
                    src={`/api/drive/inbox/${previewFile.id}/preview`}
                    className="w-full h-full border-0 animate-in fade-in zoom-in-95 duration-200"
                    title="PDF Vorschau"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground p-8">
                    <FileText className="h-10 w-10 animate-bounce" />
                    <span className="text-xs font-medium">Beleg-Datei</span>
                  </div>
                )}
              </div>
              <div className="text-center pb-1">
                <a
                  href={`/api/drive/inbox/${previewFile.id}/preview`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-primary/80 hover:text-primary transition-colors underline underline-offset-4 decoration-primary/20 hover:decoration-primary"
                >
                  {previewFile.mimeType === "application/pdf" ? "PDF in neuem Tab öffnen" : "Bild in neuem Tab öffnen"}
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

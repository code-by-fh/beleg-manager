import { useRef, useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, FileText, Plus, Inbox } from "lucide-react";
import { receiptsApi } from "@/api/receipts";
import { useDriveInbox } from "@/hooks/useDriveInbox";
import { driveApi } from "@/api/drive";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { DriveInboxFile } from "@/types/receipt";
import { InboxList } from "./InboxList";
import { CaptureSheet } from "./CaptureSheet";
import { CountdownOverlay } from "./CountdownOverlay";

type Mode = "idle" | "fab-open" | "text-sheet" | "countdown";

const COUNTDOWN_SECONDS = 5;

export function UnifiedInput() {
  const [mode, setMode] = useState<Mode>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [textInput, setTextInput] = useState("");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<DriveInboxFile | null>(null);
  const [discardFileId, setDiscardFileId] = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [file]);

  const {
    data: inboxData,
    isLoading: inboxLoading,
    isError: inboxError,
    error: inboxErrorInfo,
    refetch: refetchInbox,
  } = useDriveInbox();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  function reset() {
    setMode("idle");
    setFile(null);
    setTextInput("");
    setCountdown(COUNTDOWN_SECONDS);
  }

  function handleFileSelect(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setFile(f);
    setCountdown(COUNTDOWN_SECONDS);
    setMode("countdown");
    if (inputRef.current) inputRef.current.value = "";
  }

  const uploadFile = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setMode("idle");
    try {
      await receiptsApi.upload(file);
      toast({ title: "Beleg wird verarbeitet", description: "Er erscheint in Kürze unter Belege." });
      qc.invalidateQueries({ queryKey: ["drive", "inbox"] });
    } catch (e) {
      toast({ title: "Fehler", description: String((e as Error).message) });
    } finally {
      setBusy(false);
      setFile(null);
    }
  }, [file, qc, toast]);

  useEffect(() => {
    if (mode !== "countdown") return;
    if (countdown <= 0) { uploadFile(); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [mode, countdown, uploadFile]);

  async function submitText() {
    if (!textInput.trim()) return;
    setBusy(true);
    try {
      const res = await receiptsApi.voice(textInput.trim());
      if (res.ok) {
        toast({ title: "Beleg gespeichert" });
        qc.invalidateQueries({ queryKey: ["receipts"] });
      } else {
        toast({ title: "Verarbeitung fehlgeschlagen", description: "Beleg erscheint unter Belege zur Nachbearbeitung." });
        qc.invalidateQueries({ queryKey: ["failedVoiceJobs"] });
      }
      reset();
    } catch (e) {
      toast({ title: "Fehler", description: String((e as Error).message) });
    } finally {
      setBusy(false);
    }
  }

  async function importDriveFile(id: string) {
    setBusyId(id);
    try {
      const res = await driveApi.importFile(id);
      qc.invalidateQueries({ queryKey: ["drive", "inbox"] });
      navigate(`/review/${res.pendingId}`, {
        state: { extraction: res.extraction, fileName: res.fileName, mimeType: res.mimeType },
      });
    } catch (e) {
      toast({ title: "Import fehlgeschlagen", description: String((e as Error).message) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="relative h-full flex flex-col overflow-hidden">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      {/* Header */}
      <div className="flex-shrink-0 px-4 py-4 flex items-center justify-between border-b border-border/30">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-foreground/60" />
          <h1 className="text-foreground font-semibold text-sm">Belege Inbox</h1>
          {inboxData?.files && inboxData.files.length > 0 && (
            <span className="bg-primary/15 text-primary text-[10px] px-1.5 py-0.5 rounded-full font-bold">
              {inboxData.files.length}
            </span>
          )}
        </div>
        <button
          onClick={() => refetchInbox()}
          disabled={inboxLoading}
          className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground uppercase tracking-wider font-bold transition-colors flex items-center gap-1.5"
        >
          {inboxLoading && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
          Aktualisieren
        </button>
      </div>

      {/* Inbox */}
      <div className="flex-1 overflow-auto">
        <InboxList
          files={inboxData?.files ?? []}
          isLoading={inboxLoading && !inboxData}
          isError={inboxError}
          errorMessage={String((inboxErrorInfo as Error)?.message ?? "Unbekannter Fehler")}
          busyId={busyId}
          onImport={importDriveFile}
          onDiscard={(id) => setDiscardFileId(id)}
          onPreview={(f) => setPreviewFile(f)}
          onRefetch={() => refetchInbox()}
        />
      </div>

      {/* FAB */}
      {mode === "idle" && (
        <button
          onClick={() => setMode("fab-open")}
          className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-foreground text-background shadow-xl flex items-center justify-center hover:opacity-90 transition-opacity"
          aria-label="Beleg hinzufügen"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* Countdown Overlay */}
      {mode === "countdown" && file && (
        <CountdownOverlay
          file={file}
          countdown={countdown}
          previewUrl={previewUrl}
          onCancel={reset}
        />
      )}

      {/* Capture Sheet */}
      <CaptureSheet
        open={mode === "fab-open" || mode === "text-sheet"}
        mode={mode === "text-sheet" ? "text" : "choice"}
        textInput={textInput}
        busy={busy}
        onClose={reset}
        onSelectText={() => setMode("text-sheet")}
        onTextChange={setTextInput}
        onSubmitText={submitText}
        onOpenFilePicker={() => inputRef.current?.click()}
      />

      {/* Preview Dialog */}
      <Dialog open={previewFile !== null} onOpenChange={(open) => { if (!open) setPreviewFile(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] p-4 flex flex-col justify-between rounded-3xl">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm font-semibold truncate pr-6">{previewFile?.name}</DialogTitle>
            <DialogDescription className="sr-only">Vorschau des Belegs</DialogDescription>
          </DialogHeader>
          {previewFile && (
            <div className="flex-1 min-h-0 w-full overflow-hidden flex flex-col gap-3">
              <div className="flex-1 min-h-0 w-full rounded-2xl overflow-hidden bg-black/5 dark:bg-white/5 border border-border/10 flex items-center justify-center relative aspect-[1/1.4] max-h-[60vh]">
                {previewFile.mimeType.startsWith("image/") ? (
                  <img
                    src={`${import.meta.env.VITE_API_URL ?? ""}/api/drive/inbox/${previewFile.id}/preview`}
                    alt="Beleg Vorschau"
                    className="max-h-full max-w-full object-contain select-none animate-in fade-in zoom-in-95 duration-200"
                  />
                ) : previewFile.mimeType === "application/pdf" ? (
                  <iframe
                    src={`${import.meta.env.VITE_API_URL ?? ""}/api/drive/inbox/${previewFile.id}/preview`}
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
                  href={`${import.meta.env.VITE_API_URL ?? ""}/api/drive/inbox/${previewFile.id}/preview`}
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

      {/* Discard Dialog */}
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
    </div>
  );
}

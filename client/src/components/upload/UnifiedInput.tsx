import { useRef, useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Send, X, Loader2, Type, FileText, Eye, Trash2 } from "lucide-react";
import { receiptsApi } from "@/api/receipts";
import { cn } from "@/lib/utils";
import { useDriveInbox } from "@/hooks/useDriveInbox";
import { driveApi } from "@/api/drive";
import { useQueryClient } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { DriveInboxFile } from "@/types/receipt";

type InputMode = "idle" | "photo" | "text";

export function UnifiedInput() {
  const [mode, setMode] = useState<InputMode>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [textInput, setTextInput] = useState("");
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewFile, setPreviewFile] = useState<DriveInboxFile | null>(null);
  const [discardFileId, setDiscardFileId] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [file]);

  const { data: inboxData, isLoading: inboxLoading, isError: inboxError, error: inboxErrorInfo, refetch: refetchInbox } = useDriveInbox();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  function reset() {
    setMode("idle");
    setFile(null);
    setTextInput("");
    setContext("");
    setShowPreview(false);
  }

  function handleFileSelect(files: FileList | null) {
    const f = files?.[0];
    if (f) { setMode("photo"); setFile(f); }
  }

  async function submit() {
    setBusy(true);
    try {
      if (mode === "photo" && file) {
        await receiptsApi.upload(file, context || undefined);
        toast({ title: "Beleg wird verarbeitet", description: "Er erscheint in Kürze unter Belege." });
        qc.invalidateQueries({ queryKey: ["drive", "inbox"] });
        reset();
      } else if (mode === "text") {
        if (!textInput.trim()) { toast({ title: "Bitte zuerst Text eingeben." }); setBusy(false); return; }
        const res = await receiptsApi.voice(textInput.trim());
        if (res.ok) {
          toast({ title: "Beleg gespeichert" });
          qc.invalidateQueries({ queryKey: ["receipts"] });
        } else {
          toast({ title: "Verarbeitung fehlgeschlagen", description: "Beleg erscheint unter Belege zur Nachbearbeitung." });
          qc.invalidateQueries({ queryKey: ["failedVoiceJobs"] });
        }
        reset();
      }
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
      navigate(`/review/${res.pendingId}`, { state: { extraction: res.extraction, fileName: res.fileName, mimeType: res.mimeType } });
    } catch (e) {
      toast({ title: "Import fehlgeschlagen", description: String((e as Error).message) });
    } finally {
      setBusyId(null);
    }
  }

  const canSubmit =
    (mode === "photo" && !!file) ||
    (mode === "text" && !!textInput.trim());

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      {mode !== "idle" && (
        <div className="flex-shrink-0 border-b border-border/30 bg-white/40 dark:bg-white/5 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
          <span className="text-foreground font-medium text-sm">
            {mode === "photo" && "Foto hochladen"}
            {mode === "text" && "Text eingeben"}
          </span>
          <button
            onClick={reset}
            className="text-muted-foreground hover:text-foreground transition-all duration-300 p-1 rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">

        {/* IDLE */}
        {mode === "idle" && (
          <div className="min-h-full flex flex-col items-center justify-center px-6 py-12 gap-8">
            <div className="text-center space-y-1">
              <h1 className="text-2xl font-display font-extrabold tracking-tight gradient-text">Beleg erfassen</h1>
              <p className="text-muted-foreground text-sm">Wähle eine Eingabemethode</p>
            </div>

            <div className="w-full max-w-xs space-y-3">
              <button
                onClick={() => inputRef.current?.click()}
                className="w-full bg-[var(--surface)] border border-[hsl(var(--border))] rounded-xl p-4 flex items-center gap-4 transition-all duration-300 hover:border-[hsl(var(--foreground))]/30"
              >
                <div className="w-11 h-11 rounded-xl bg-foreground flex items-center justify-center flex-shrink-0">
                  <Upload className="h-5 w-5 text-background" />
                </div>
                <div className="text-left">
                  <p className="text-foreground font-medium text-sm">Foto hochladen</p>
                  <p className="text-muted-foreground text-xs">JPG, PNG, PDF aus Galerie</p>
                </div>
              </button>

              <button
                onClick={() => setMode("text")}
                className="w-full bg-[var(--surface)] border border-[hsl(var(--border))] rounded-xl p-4 flex items-center gap-4 transition-all duration-300 hover:border-[hsl(var(--foreground))]/30"
              >
                <div className="w-11 h-11 rounded-xl bg-foreground flex items-center justify-center flex-shrink-0">
                  <Type className="h-5 w-5 text-background" />
                </div>
                <div className="text-left">
                  <p className="text-foreground font-medium text-sm">Text eingeben</p>
                  <p className="text-muted-foreground text-xs">Beleg als Text beschreiben</p>
                </div>
              </button>
            </div>

            {/* Inbox Section */}
            <div className="w-full max-w-xs space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-[hsl(var(--foreground))]/15 flex items-center justify-center">
                    <Inbox className="h-3.5 w-3.5 text-[hsl(var(--foreground))]" />
                  </div>
                  <h2 className="text-foreground font-semibold text-xs">Belege Eingang (Drive)</h2>
                  {inboxData?.files && inboxData.files.length > 0 && (
                    <span className="bg-primary/15 text-primary text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                      {inboxData.files.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => refetchInbox()}
                  disabled={inboxLoading}
                  className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground uppercase tracking-wider font-bold transition-all duration-300 flex items-center gap-1.5"
                >
                  {inboxLoading && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                  Aktualisieren
                </button>
              </div>

              <div className="clay-card-static rounded-2xl overflow-hidden divide-y divide-border/30">
                {inboxLoading && !inboxData ? (
                  <div className="p-8 flex justify-center">
                    <Loader2 className="h-5 w-5 text-muted-foreground/30 animate-spin" />
                  </div>
                ) : inboxError ? (
                  <div className="p-8 text-center space-y-2">
                    <p className="text-red-500/70 text-[11px] font-medium">Verbindung fehlgeschlagen</p>
                    <p className="text-muted-foreground/50 text-[9px] px-4">
                      {String((inboxErrorInfo as Error)?.message ?? "Unbekannter Fehler")}
                    </p>
                  </div>
                ) : !inboxData?.files || inboxData.files.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <div className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center mx-auto">
                      <Inbox className="h-4 w-4 text-muted-foreground/20" />
                    </div>
                    <p className="text-muted-foreground/40 text-[10px]">Keine Dateien in der Inbox</p>
                  </div>
                ) : (
                  inboxData.files.map((f) => (
                    <div key={f.id} className="p-3 flex items-center justify-between gap-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                      <div
                        onClick={() => setPreviewFile(f)}
                        className="min-w-0 flex-1 cursor-pointer group hover:opacity-85 flex items-center gap-2"
                      >
                        <div className="relative flex-shrink-0">
                          <FileText className="h-4 w-4 text-foreground/40 transition-transform duration-200 group-hover:scale-110" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/95 dark:bg-black/95 rounded">
                            <Eye className="h-3 w-3 text-foreground" />
                          </div>
                        </div>
                        <div className="min-w-0">
                          <p className="text-foreground text-[11px] font-medium truncate group-hover:underline decoration-foreground/30">{f.name}</p>
                          <p className={cn(
                            "text-[9px] truncate",
                            f.status === "failed" ? "text-red-500/70" : "text-muted-foreground/60"
                          )}>
                            {f.status === "pending_review" && "Bereit zum Review"}
                            {f.status === "new" && "Wartet auf Verarbeitung"}
                            {f.status === "failed" && "Verarbeitung fehlgeschlagen"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => setDiscardFileId(f.id)}
                          disabled={!!busyId}
                          className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
                          title="Beleg verwerfen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => importDriveFile(f.id)}
                          disabled={!!busyId}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all duration-300",
                            f.status === "pending_review"
                              ? "bg-[hsl(var(--foreground))]/15 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--foreground))]/25"
                              : "bg-black/5 dark:bg-white/5 text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {busyId === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : f.status === "pending_review" ? "Review" : "Start"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* PHOTO */}
        {mode === "photo" && file && (
          <div className="p-6 flex flex-col items-center gap-6">
            <div className="clay-card-static rounded-[32px] p-5 w-full max-w-sm text-center space-y-2">
              {previewUrl ? (
                <>
                  <button
                    onClick={() => setShowPreview((v) => !v)}
                    className="sm:hidden text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mx-auto"
                  >
                    <Eye className="h-3 w-3" />
                    {showPreview ? "Vorschau ausblenden" : "Vorschau anzeigen"}
                  </button>
                  <div className={cn(
                    "relative aspect-[3/4] w-full overflow-hidden rounded-[24px] bg-black/5 dark:bg-white/5 flex items-center justify-center border border-border/20 mx-auto",
                    showPreview ? "block" : "hidden sm:block"
                  )}>
                    <img
                      src={previewUrl}
                      alt="Vorschau"
                      className="max-h-full max-w-full object-contain rounded-[20px] select-none"
                    />
                  </div>
                </>
              ) : file.type === "application/pdf" ? (
                <div className="w-12 h-12 rounded-2xl bg-foreground flex items-center justify-center mx-auto">
                  <FileText className="h-6 w-6 text-background" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-foreground flex items-center justify-center mx-auto">
                  <Upload className="h-6 w-6 text-background" />
                </div>
              )}
              <p className="text-foreground font-medium text-sm break-all">{file.name}</p>
              <p className="text-muted-foreground text-xs">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
            </div>

            <div className="w-full max-w-xs space-y-3">
              <input
                placeholder="Optionaler Kontext…"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                disabled={busy}
                maxLength={200}
                className="clay-input w-full px-4 py-2.5 text-sm"
              />
              <button
                onClick={submit}
                disabled={!canSubmit || busy}
                className={cn(
                  "w-full h-14 rounded-[20px] flex items-center justify-center gap-2 font-bold transition-all duration-300",
                  canSubmit && !busy
                    ? "rounded-lg bg-foreground text-background"
                    : "bg-black/5 dark:bg-white/5 text-muted-foreground cursor-not-allowed"
                )}
              >
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Wird hochgeladen…</> : <><Send className="h-4 w-4" /> Erfassen</>}
              </button>
            </div>
          </div>
        )}

        {/* TEXT */}
        {mode === "text" && (
          <div className="p-6 flex flex-col items-center gap-6">
            <div className="w-full max-w-xs space-y-3">
              <textarea
                placeholder="z. B. Tankrechnung 48,50 EUR bei Shell am 15.05."
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                disabled={busy}
                rows={5}
                maxLength={500}
                autoFocus
                className="clay-input w-full px-4 py-3 text-sm resize-none leading-relaxed"
              />
              <button
                onClick={submit}
                disabled={!canSubmit || busy}
                className={cn(
                  "w-full h-14 rounded-[20px] flex items-center justify-center gap-2 font-bold transition-all duration-300",
                  canSubmit && !busy
                    ? "rounded-lg bg-foreground text-background"
                    : "bg-black/5 dark:bg-white/5 text-muted-foreground cursor-not-allowed"
                )}
              >
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Verarbeite…</> : <><Send className="h-4 w-4" /> Verarbeiten</>}
              </button>
            </div>
          </div>
        )}
      </div>

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

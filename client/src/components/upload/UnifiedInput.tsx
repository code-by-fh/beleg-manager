import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { Camera, Mic, MicOff, Upload, Send, X, RotateCcw, Loader2 } from "lucide-react";
import { receiptsApi } from "@/api/receipts";
import { createRecognizer, isSpeechRecognitionSupported, type SpeechController } from "@/lib/speechRecognition";
import { cn } from "@/lib/utils";
import { AIProcessingOverlay } from "./AIProcessingOverlay";
import { useDriveInbox } from "@/hooks/useDriveInbox";
import { driveApi } from "@/api/drive";
import { Inbox } from "lucide-react";

type InputMode = "idle" | "photo" | "camera" | "voice";

export function UnifiedInput() {
  const [mode, setMode] = useState<InputMode>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [snapshot, setSnapshot] = useState<Blob | null>(null);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [speechSupported] = useState(isSpeechRecognitionSupported());
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: inboxData, isLoading: inboxLoading, refetch: refetchInbox } = useDriveInbox();

  const inputRef  = useRef<HTMLInputElement>(null);
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef    = useRef<SpeechController | null>(null);
  const { toast } = useToast();
  const navigate  = useNavigate();

  useEffect(() => {
    if (!speechSupported) return;
    recRef.current = createRecognizer({
      lang: "de-DE",
      onResult: (r) => {
        if (r.isFinal) {
          setFinalText((p) => (p ? p + " " : "") + r.transcript.trim());
          setInterim("");
        } else {
          setInterim(r.transcript);
        }
      },
      onError: () => setRecording(false),
      onEnd:   () => setRecording(false),
    });
  }, [speechSupported]);

  useEffect(() => {
    if (!recording) return;
    const handleGlobalUp = () => stopRecording();
    window.addEventListener("pointerup", handleGlobalUp);
    return () => window.removeEventListener("pointerup", handleGlobalUp);
  }, [recording]);

  useEffect(() => {
    if (mode !== "camera") return;
    let cancelled = false;
    (async () => {
      try {
        setCameraError(null);
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (e) {
        setCameraError(`Kamerazugriff verweigert: ${(e as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [mode]);

  function reset() {
    setMode("idle");
    setFile(null);
    setSnapshot(null);
    if (snapshotUrl) URL.revokeObjectURL(snapshotUrl);
    setSnapshotUrl(null);
    setRecording(false);
    setFinalText(""); setInterim(""); setContext("");
    setCameraError(null);
  }

  function handleFileSelect(files: FileList | null) {
    const f = files?.[0];
    if (f) { setMode("photo"); setFile(f); }
  }

  function startRecording(e: React.PointerEvent) {
    if (!recRef.current || busy) return;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (e) {}
    setMode("voice");
    setFinalText("");
    setInterim("");
    recRef.current.start();
    setRecording(true);
  }

  function stopRecording() {
    if (!recording) return;
    recRef.current?.stop();
    setRecording(false);
    setTimeout(() => { submit(); }, 200);
  }

  function takePhoto() {
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setSnapshot(blob);
      if (snapshotUrl) URL.revokeObjectURL(snapshotUrl);
      setSnapshotUrl(URL.createObjectURL(blob));
    }, "image/jpeg", 0.92);
  }

  async function submit() {
    setBusy(true);
    try {
      let res;
      if (mode === "photo" && file) {
        res = await receiptsApi.upload(file, context || undefined);
      } else if (mode === "camera" && snapshot) {
        const f = new File([snapshot], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
        res = await receiptsApi.upload(f, context || undefined);
      } else if (mode === "voice") {
        const transcript = (finalText + " " + interim).trim();
        if (!transcript) { toast({ title: "Bitte zuerst etwas einsprechen." }); setBusy(false); return; }
        res = await receiptsApi.voice(transcript);
      } else return;
      navigate(`/review/${res.pendingId}`, { state: { extraction: res.extraction, fileName: res.fileName } });
    } catch (e) {
      toast({ title: "Verarbeitung fehlgeschlagen", description: String((e as Error).message) });
    } finally {
      setBusy(false);
    }
  }

  async function importDriveFile(id: string) {
    setBusyId(id);
    try {
      const res = await driveApi.importFile(id);
      navigate(`/review/${res.pendingId}`, { state: { extraction: res.extraction, fileName: res.fileName } });
    } catch (e) {
      toast({ title: "Import fehlgeschlagen", description: String((e as Error).message) });
    } finally {
      setBusyId(null);
    }
  }

  const canSubmit =
    (mode === "photo" && !!file) ||
    (mode === "camera" && !!snapshot) ||
    (mode === "voice" && !!(finalText || interim));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AIProcessingOverlay isVisible={busy || !!busyId} />

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      {/* ── Sub-header when active ── */}
      {mode !== "idle" && (
        <div className="flex-shrink-0 border-b border-border/30 bg-white/40 dark:bg-white/5 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
          <span className="text-foreground font-medium text-sm">
            {mode === "photo" && "Foto hochladen"}
            {mode === "camera" && "Kamera"}
            {mode === "voice" && "Spracheingabe"}
          </span>
          <button
            onClick={reset}
            className="text-muted-foreground hover:text-foreground transition-all duration-300 p-1 rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 min-h-0 overflow-auto">

        {/* IDLE */}
        {mode === "idle" && (
          <div className="h-full flex flex-col items-center justify-center px-6 gap-6">
            <div className="text-center space-y-1">
              <h1 className="text-2xl font-display font-extrabold tracking-tight gradient-text">Beleg erfassen</h1>
              <p className="text-muted-foreground text-sm">Wähle eine Eingabemethode</p>
            </div>

            <div className="w-full max-w-xs space-y-3">
              <button
                onClick={() => inputRef.current?.click()}
                className="w-full bg-[var(--surface)] border border-[hsl(var(--border))] rounded-xl p-4 flex items-center gap-4 transition-all duration-300"
              >
                <div className="w-11 h-11 rounded-xl bg-[hsl(var(--foreground))] flex items-center justify-center flex-shrink-0">
                  <Upload className="h-5 w-5 text-white" />
                </div>
                <div className="text-left">
                  <p className="text-foreground font-medium text-sm">Foto hochladen</p>
                  <p className="text-muted-foreground text-xs">JPG, PNG, PDF aus Galerie</p>
                </div>
              </button>

              <button
                onClick={() => setMode("camera")}
                className="w-full bg-[var(--surface)] border border-[hsl(var(--border))] rounded-xl p-4 flex items-center gap-4 transition-all duration-300"
              >
                <div className="w-11 h-11 rounded-xl bg-[hsl(var(--foreground))] flex items-center justify-center flex-shrink-0">
                  <Camera className="h-5 w-5 text-white" />
                </div>
                <div className="text-left">
                  <p className="text-foreground font-medium text-sm">Mit Kamera</p>
                  <p className="text-muted-foreground text-xs">Direkt fotografieren</p>
                </div>
              </button>

              {speechSupported && (
                <button
                  onPointerDown={startRecording}
                  onPointerUp={stopRecording}
                  onContextMenu={(e) => e.preventDefault()}
                  className="w-full bg-[var(--surface)] border border-[hsl(var(--border))] rounded-xl p-4 flex items-center gap-4 transition-all duration-300"
                >
                  <div className="w-11 h-11 rounded-xl bg-[hsl(var(--foreground))] flex items-center justify-center flex-shrink-0">
                    <Mic className="h-5 w-5 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-foreground font-medium text-sm">Sprache</p>
                    <p className="text-muted-foreground text-xs">Halten zum Sprechen</p>
                  </div>
                </button>
              )}
            </div>

            {/* ── Inbox Section ── */}
            <div className="w-full max-w-xs mt-4 space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-[hsl(var(--foreground))]/15 flex items-center justify-center">
                    <Inbox className="h-3.5 w-3.5 text-[hsl(var(--foreground))]" />
                  </div>
                  <h2 className="text-foreground font-semibold text-xs">Inbox</h2>
                  {inboxData?.files && inboxData.files.length > 0 && (
                    <span className="bg-primary/15 text-primary text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                      {inboxData.files.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => refetchInbox()}
                  className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground uppercase tracking-wider font-bold transition-all duration-300"
                >
                  Aktualisieren
                </button>
              </div>

              <div className="clay-card-static rounded-2xl overflow-hidden divide-y divide-border/30">
                {inboxLoading ? (
                  <div className="p-6 flex justify-center">
                    <Loader2 className="h-4 w-4 text-muted-foreground/30 animate-spin" />
                  </div>
                ) : !inboxData?.files || inboxData.files.length === 0 ? (
                  <div className="p-6 text-center">
                    <p className="text-muted-foreground/40 text-[10px]">Keine Dateien in der Inbox</p>
                  </div>
                ) : (
                  inboxData.files.map((f) => (
                    <div key={f.id} className="p-3 flex items-center justify-between gap-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground text-[11px] font-medium truncate">{f.name}</p>
                        <p className="text-muted-foreground/60 text-[9px] truncate">
                          {f.status === "pending_review" ? "Bereit zum Review" : "Wartet auf Verarbeitung"}
                        </p>
                      </div>
                      <button
                        onClick={() => importDriveFile(f.id)}
                        disabled={!!busyId}
                        className={cn(
                          "flex-shrink-0 px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all duration-300",
                          f.status === "pending_review"
                            ? "bg-[hsl(var(--foreground))]/15 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--foreground))]/25"
                            : "bg-black/5 dark:bg-white/5 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {busyId === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : f.status === "pending_review" ? "Review" : "Start"}
                      </button>
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
            <div className="clay-card-static rounded-[32px] p-5 w-full max-w-xs text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-[hsl(var(--foreground))] flex items-center justify-center mx-auto">
                <Upload className="h-6 w-6 text-white" />
              </div>
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
                    ? "rounded-lg bg-[hsl(var(--foreground))] text-white"
                    : "bg-black/5 dark:bg-white/5 text-muted-foreground cursor-not-allowed"
                )}
              >
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Verarbeite…</> : <><Send className="h-4 w-4" /> Verarbeiten</>}
              </button>
            </div>
          </div>
        )}

        {/* CAMERA */}
        {mode === "camera" && (
          <div className="h-full flex flex-col">
            {cameraError ? (
              <div className="flex-1 flex items-center justify-center px-6">
                <div className="clay-card-static rounded-[32px] p-6 text-center space-y-3 max-w-xs">
                  <Camera className="h-8 w-8 mx-auto text-red-400/70" />
                  <p className="text-red-500 dark:text-red-400 text-sm">{cameraError}</p>
                </div>
              </div>
            ) : (
              <div className="relative flex-1 bg-black overflow-hidden flex flex-col">
                <div className="relative flex-1 overflow-hidden">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  {snapshotUrl && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
                      <img src={snapshotUrl} alt="Aufnahme" className="max-h-full rounded-2xl border-2 border-white/20 shadow-2xl" />
                    </div>
                  )}
                </div>

                <div className="flex-shrink-0 p-4 space-y-3 bg-black/40 backdrop-blur-md border-t border-white/10">
                  <input
                    placeholder="Optionaler Kontext…"
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    disabled={busy}
                    maxLength={200}
                    className="w-full rounded-xl px-4 py-2.5 text-sm bg-white/10 border border-white/15 text-white placeholder:text-white/40 outline-none focus:border-white/30 transition-all"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={takePhoto}
                      disabled={busy}
                      className="flex-1 h-12 rounded-xl flex items-center justify-center text-white/70 hover:text-white bg-white/10 hover:bg-white/15 transition-all"
                    >
                      <Camera className="h-5 w-5" />
                    </button>
                    {snapshot && (
                      <button
                        onClick={() => { setSnapshot(null); if (snapshotUrl) URL.revokeObjectURL(snapshotUrl); setSnapshotUrl(null); }}
                        className="flex-1 h-12 rounded-xl flex items-center justify-center text-white/70 hover:text-white bg-white/10 hover:bg-white/15 transition-all"
                      >
                        <RotateCcw className="h-5 w-5" />
                      </button>
                    )}
                    <button
                      onClick={submit}
                      disabled={!canSubmit || busy}
                      className={cn(
                        "flex-1 h-12 rounded-xl flex items-center justify-center font-medium transition-all",
                        canSubmit && !busy
                          ? "bg-primary text-white hover:bg-primary/90"
                          : "bg-white/10 text-white/30 cursor-not-allowed"
                      )}
                    >
                      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VOICE */}
        {mode === "voice" && (
          <div className="h-full flex flex-col items-center justify-center px-6 pb-4">
            <div className="w-full max-w-xs space-y-6">
              {/* Mic orb */}
              <div className="flex flex-col items-center gap-3">
                <div className={cn(
                  "w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300",
                  recording
                    ? "bg-red-500/15 shadow-[0_0_40px_rgba(239,68,68,0.3)] animate-pulse"
                    : "clay-card-static"
                )}>
                  <Mic className={cn("h-10 w-10 transition-colors", recording ? "text-red-500" : "text-muted-foreground")} />
                </div>
                <p className="text-muted-foreground text-sm">
                  {recording ? "Aufnahme läuft…" : "Bereit"}
                </p>
              </div>

              {/* Transcript */}
              <div className="clay-card-static rounded-2xl p-4 min-h-[80px] flex flex-col justify-center">
                {finalText || interim ? (
                  <div className="space-y-1">
                    <p className="text-foreground text-sm leading-relaxed">{finalText}</p>
                    {interim && <p className="text-muted-foreground text-sm italic">{interim}</p>}
                  </div>
                ) : (
                  <p className="text-muted-foreground/50 text-sm text-center">Transkript erscheint hier…</p>
                )}
              </div>

              <button
                onPointerDown={startRecording}
                onPointerUp={stopRecording}
                onContextMenu={(e) => e.preventDefault()}
                disabled={busy}
                className={cn(
                  "w-full h-16 rounded-2xl font-bold text-lg transition-all duration-300 flex items-center justify-center gap-3",
                  recording
                    ? "bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.4)] scale-[0.98] text-white"
                    : "rounded-lg bg-[hsl(var(--foreground))] text-white"
                )}
              >
                {recording ? <MicOff className="h-6 w-6 animate-pulse" /> : <Mic className="h-6 w-6" />}
                {recording ? "Loslassen zum Senden" : "Halten zum Sprechen"}
              </button>
            </div>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

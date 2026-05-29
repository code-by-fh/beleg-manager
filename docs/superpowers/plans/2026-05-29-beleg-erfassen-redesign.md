# Beleg Erfassen — Mobile-First Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the "Beleg erfassen" page into a mobile-first, inbox-centric layout with FAB + Bottom-Sheet capture and full-screen countdown overlay.

**Architecture:** `UnifiedInput.tsx` becomes a thin orchestrator holding all state and API logic. Three new focused components handle rendering: `InboxList`, `CaptureSheet`, `CountdownOverlay`. No API changes — pure frontend refactoring with component decomposition.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Radix UI Dialog, Lucide React, shadcn/ui Skeleton, TanStack Query

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `client/src/components/upload/CountdownOverlay.tsx` | **Create** | Full-screen countdown with image preview |
| `client/src/components/upload/InboxList.tsx` | **Create** | Inbox item list with loading/error/empty states |
| `client/src/components/upload/CaptureSheet.tsx` | **Create** | Bottom-sheet with choice→text morph |
| `client/src/components/upload/UnifiedInput.tsx` | **Rewrite** | Orchestrator: state machine, API calls, renders sub-components |

---

## Task 1: Create `CountdownOverlay.tsx`

**Files:**
- Create: `client/src/components/upload/CountdownOverlay.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { X, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CountdownOverlayProps {
  file: File;
  countdown: number;
  previewUrl: string | null;
  onCancel: () => void;
}

const COUNTDOWN_SECONDS = 5;
const radius = 40;
const circumference = 2 * Math.PI * radius;

export function CountdownOverlay({ file, countdown, previewUrl, onCancel }: CountdownOverlayProps) {
  const progress = (countdown / COUNTDOWN_SECONDS) * circumference;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-6 px-6">
      <div className="relative">
        <svg width="80" height="80" className="-rotate-90">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="3" />
          <circle
            cx="40" cy="40" r={radius}
            fill="none"
            stroke="hsl(var(--foreground))"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            style={{ transition: "stroke-dashoffset 0.9s linear" }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-foreground">
          {countdown}
        </span>
      </div>

      {previewUrl ? (
        <img
          src={previewUrl}
          alt="Vorschau"
          className="max-h-[45vh] max-w-full object-contain rounded-2xl border border-border/20 shadow-lg"
        />
      ) : (
        <div className="w-20 h-20 rounded-2xl bg-foreground flex items-center justify-center">
          {file.type === "application/pdf" ? (
            <FileText className="h-8 w-8 text-background" />
          ) : (
            <Upload className="h-8 w-8 text-background" />
          )}
        </div>
      )}

      <div className="text-center space-y-1">
        <p className="text-foreground font-medium text-sm break-all max-w-xs">{file.name}</p>
        <p className="text-muted-foreground text-xs">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
        <p className="text-muted-foreground text-xs">
          Wird in {countdown} Sekunde{countdown !== 1 ? "n" : ""} hochgeladen…
        </p>
      </div>

      <Button variant="outline" onClick={onCancel} className="w-full max-w-xs">
        <X className="h-4 w-4 mr-2" />
        Abbrechen
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors related to `CountdownOverlay.tsx`

- [ ] **Step 3: Commit**

```bash
git add client/src/components/upload/CountdownOverlay.tsx
git commit -m "feat(upload): add CountdownOverlay component"
```

---

## Task 2: Create `InboxList.tsx`

**Files:**
- Create: `client/src/components/upload/InboxList.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { Inbox, Loader2, Eye, Trash2, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { DriveInboxFile } from "@/types/receipt";

interface InboxListProps {
  files: DriveInboxFile[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  busyId: string | null;
  onImport: (id: string) => void;
  onDiscard: (id: string) => void;
  onPreview: (file: DriveInboxFile) => void;
  onRefetch: () => void;
}

export function InboxList({
  files, isLoading, isError, errorMessage, busyId,
  onImport, onDiscard, onPreview, onRefetch,
}: InboxListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 px-6 text-center">
        <p className="text-red-500/70 text-sm font-medium">Verbindung fehlgeschlagen</p>
        <p className="text-muted-foreground/50 text-xs">{errorMessage}</p>
        <button
          onClick={onRefetch}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
        >
          Erneut versuchen
        </button>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 px-6 text-center">
        <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center">
          <Inbox className="h-6 w-6 text-muted-foreground/30" />
        </div>
        <p className="text-muted-foreground/50 text-sm">Noch keine Belege in der Inbox</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      {files.map((f) => (
        <div
          key={f.id}
          className="bg-[var(--surface)] border border-border/40 rounded-xl p-3 flex items-center justify-between gap-3"
        >
          <div
            onClick={() => onPreview(f)}
            className="min-w-0 flex-1 cursor-pointer group hover:opacity-80 flex items-center gap-2.5"
          >
            <div className="relative flex-shrink-0">
              <FileText className="h-4 w-4 text-foreground/40 transition-transform duration-200 group-hover:scale-110" />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 dark:bg-black/95 rounded">
                <Eye className="h-3 w-3 text-foreground" />
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-foreground text-xs font-medium truncate group-hover:underline decoration-foreground/30">
                {f.name}
              </p>
              <p className={cn(
                "text-[10px] truncate",
                f.status === "failed" ? "text-red-500/70" : "text-muted-foreground/60",
              )}>
                {f.status === "pending_review" && "Bereit zum Review"}
                {f.status === "new" && "Wartet auf Verarbeitung"}
                {f.status === "failed" && "Verarbeitung fehlgeschlagen"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => onDiscard(f.id)}
              disabled={!!busyId}
              className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
              title="Beleg verwerfen"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onImport(f.id)}
              disabled={!!busyId}
              className={cn(
                "px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all duration-300",
                f.status === "pending_review"
                  ? "bg-foreground/15 text-foreground hover:bg-foreground/25"
                  : "bg-black/5 dark:bg-white/5 text-muted-foreground hover:text-foreground",
              )}
            >
              {busyId === f.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : f.status === "pending_review" ? "Review" : "Start"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors related to `InboxList.tsx`

- [ ] **Step 3: Commit**

```bash
git add client/src/components/upload/InboxList.tsx
git commit -m "feat(upload): add InboxList component"
```

---

## Task 3: Create `CaptureSheet.tsx`

**Files:**
- Create: `client/src/components/upload/CaptureSheet.tsx`

Note: `CaptureSheetProps` includes `onSelectText: () => void` — this is the callback the parent uses to transition from `fab-open` to `text-sheet` mode. The spec's prop list omitted this; it is required.

- [ ] **Step 1: Create the file**

```tsx
import { X, Upload, Type, Send, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface CaptureSheetProps {
  open: boolean;
  mode: "choice" | "text";
  textInput: string;
  busy: boolean;
  onClose: () => void;
  onSelectText: () => void;
  onTextChange: (value: string) => void;
  onSubmitText: () => void;
  onOpenFilePicker: () => void;
}

export function CaptureSheet({
  open, mode, textInput, busy,
  onClose, onSelectText, onTextChange, onSubmitText, onOpenFilePicker,
}: CaptureSheetProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="fixed bottom-0 inset-x-0 top-auto rounded-t-2xl rounded-b-none max-w-none w-full p-0 border-t border-border/40 data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom duration-300">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-8 h-1 bg-border rounded-full" />
        </div>

        {mode === "choice" ? (
          <div className="px-6 pb-8 pt-2 space-y-4">
            <p className="text-foreground font-semibold text-sm text-center">Beleg hinzufügen</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={onOpenFilePicker}
                className="bg-[var(--surface)] border border-border/40 rounded-xl p-5 flex flex-col items-center gap-2.5 hover:border-foreground/30 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-foreground flex items-center justify-center">
                  <Upload className="h-5 w-5 text-background" />
                </div>
                <div className="text-center">
                  <p className="text-foreground font-medium text-sm">Foto / Dokument</p>
                  <p className="text-muted-foreground text-xs">JPG, PNG, PDF</p>
                </div>
              </button>

              <button
                onClick={onSelectText}
                className="bg-[var(--surface)] border border-border/40 rounded-xl p-5 flex flex-col items-center gap-2.5 hover:border-foreground/30 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-foreground flex items-center justify-center">
                  <Type className="h-5 w-5 text-background" />
                </div>
                <div className="text-center">
                  <p className="text-foreground font-medium text-sm">Text eingeben</p>
                  <p className="text-muted-foreground text-xs">Beleg beschreiben</p>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="px-6 pb-8 pt-2 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-foreground font-semibold text-sm">Text eingeben</p>
              <button
                onClick={onClose}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              placeholder="z. B. Tankrechnung 48,50 EUR bei Shell am 15.05."
              value={textInput}
              onChange={(e) => onTextChange(e.target.value)}
              disabled={busy}
              rows={4}
              maxLength={500}
              autoFocus
              className="clay-input w-full px-4 py-3 text-sm resize-none leading-relaxed"
            />
            <button
              onClick={onSubmitText}
              disabled={!textInput.trim() || busy}
              className={cn(
                "w-full h-12 rounded-xl flex items-center justify-center gap-2 font-bold transition-all duration-300",
                textInput.trim() && !busy
                  ? "bg-foreground text-background"
                  : "bg-black/5 dark:bg-white/5 text-muted-foreground cursor-not-allowed",
              )}
            >
              {busy ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Verarbeite…</>
              ) : (
                <><Send className="h-4 w-4" /> Verarbeiten</>
              )}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors related to `CaptureSheet.tsx`

- [ ] **Step 3: Commit**

```bash
git add client/src/components/upload/CaptureSheet.tsx
git commit -m "feat(upload): add CaptureSheet bottom-sheet component"
```

---

## Task 4: Rewrite `UnifiedInput.tsx` as Orchestrator

**Files:**
- Modify: `client/src/components/upload/UnifiedInput.tsx`

This task replaces the entire file content. The new version uses the four-state mode machine and renders the three new sub-components. All API logic (`uploadFile`, `submitText`, `importDriveFile`) and hooks remain identical to the original.

- [ ] **Step 1: Replace `UnifiedInput.tsx` entirely**

```tsx
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

  useEffect(() => {
    if (mode !== "countdown") return;
    if (countdown <= 0) { uploadFile(); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, countdown]);

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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no type errors

- [ ] **Step 3: Verify the dev server starts**

```bash
cd client && npm run dev
```

Expected: Vite starts without errors, no red console errors on `/upload`

- [ ] **Step 4: Manual smoke test — Idle state**

Open `http://localhost:5173/upload` (or the configured dev port) on mobile viewport (Chrome DevTools → iPhone SE).

Verify:
- Inbox list fills the screen
- Counter badge in header shows correct count (or nothing if 0)
- "Aktualisieren" button works
- FAB `+` button is visible bottom-right
- No stale "idle" layout from before (no "Wähle eine Eingabemethode" text)

- [ ] **Step 5: Manual smoke test — FAB → Foto path**

Tap the `+` FAB → Bottom-Sheet slides up → two buttons visible ("Foto / Dokument", "Text eingeben").

Tap "Foto / Dokument" → file picker opens. Select an image.

Verify:
- Bottom-sheet closes
- Full-screen countdown overlay appears with the ring timer
- Image preview is visible (no toggle button, always shown)
- File name and size shown below preview
- "Abbrechen" stops the countdown and returns to idle with FAB

Let countdown reach 0 → upload fires → toast "Beleg wird verarbeitet" → returns to idle.

- [ ] **Step 6: Manual smoke test — FAB → Text path**

Tap `+` → Bottom-Sheet opens → Tap "Text eingeben".

Verify:
- Sheet morphs: two-button grid replaced by textarea + "Verarbeiten" button
- `autoFocus` puts cursor in textarea immediately
- "Verarbeiten" is disabled when textarea is empty
- X button closes the sheet and resets to idle
- Enter text → "Verarbeiten" becomes active → tap → API call fires → toast → reset to idle

- [ ] **Step 7: Manual smoke test — Inbox actions**

Verify existing inbox item actions still work:
- Tap file name/icon → preview dialog opens with image/PDF
- Tap Trash → discard confirmation dialog appears → confirm deletes item
- Tap "Start"/"Review" → navigates to `/review/:id`

- [ ] **Step 8: Commit**

```bash
git add client/src/components/upload/UnifiedInput.tsx
git commit -m "feat(upload): refactor UnifiedInput — inbox-first layout with FAB + bottom-sheet"
```

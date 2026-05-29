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

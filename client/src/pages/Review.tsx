import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ReceiptForm } from "@/components/receipts/ReceiptForm";
import { ReviewPreview } from "@/components/receipts/ReviewPreview";
import { useToast } from "@/components/ui/use-toast";
import { receiptsApi } from "@/api/receipts";
import { useState, useEffect, useCallback, useRef } from "react";
import type { Extraction, ReceiptRow } from "@/types/receipt";
import { CheckCircle2, ArrowLeft, AlertTriangle, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type QueueItem = { pendingId: string; extraction: Extraction; fileName?: string; mimeType?: string | null };
type LocationState = { extraction?: Extraction; fileName?: string; mimeType?: string; queue?: QueueItem[] } | null;

export function ReviewPage() {
  const { pendingId } = useParams<{ pendingId: string }>();
  const { state } = useLocation() as { state: LocationState };
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [duplicate, setDuplicate] = useState<ReceiptRow | null>(null);
  const [fetchedExtraction, setFetchedExtraction] = useState<Extraction | null>(null);
  const [fetchedMimeType, setFetchedMimeType] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // If navigated to directly (e.g. from Telegram link), fetch extraction from server
  useEffect(() => {
    if (!pendingId) return;
    if (state?.extraction) {
      setFetchedMimeType(state.mimeType ?? null);
      return;
    }
    receiptsApi.getPending(pendingId)
      .then((r) => {
        setFetchedExtraction(r.extraction);
        setFetchedMimeType(r.mimeType ?? null);
      })
      .catch(() => setFetchError(true));
  }, [pendingId, state]);

  const extraction = state?.extraction ?? fetchedExtraction;
  const mimeType = state?.mimeType ?? fetchedMimeType;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleValuesChange = useCallback((values: { haendler: string; betrag: number; datum: string }) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!values.haendler || isNaN(values.betrag) || !values.datum) {
      setDuplicate(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      receiptsApi.checkDuplicate(values.haendler, values.betrag, values.datum)
        .then((r) => setDuplicate(r.duplicate))
        .catch(() => setDuplicate(null));
    }, 400);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (!pendingId || fetchError) {
    return (
      <div className="h-full flex items-center justify-center px-6">
        <div className="flat-card p-6 max-w-sm w-full text-center space-y-3">
          <p className="text-muted-foreground text-sm">Review-Sitzung nicht mehr gültig. Bitte erneut hochladen.</p>
          <button onClick={() => navigate("/upload")} className="text-primary text-sm hover:opacity-80 transition">
            Zurück
          </button>
        </div>
      </div>
    );
  }

  if (!extraction) {
    return (
      <div className="h-full flex items-center justify-center px-6">
        <div className="flat-card p-6 max-w-sm w-full text-center">
          <p className="text-muted-foreground text-sm animate-pulse">Lade Beleg…</p>
        </div>
      </div>
    );
  }

  const initial = {
    datum:           extraction.datum ?? undefined,
    haendler:        extraction.haendler ?? undefined,
    betrag:          extraction.betrag ?? undefined,
    mwst:            extraction.mwst ?? 0,
    waehrung:        extraction.waehrung ?? "EUR",
    kategorie:       extraction.kategorie ?? "Sonstiges",
    zahlungsmethode: extraction.zahlungsmethode ?? "(Kredit-)Karte",
    rechnungsnummer: extraction.rechnungsnummer ?? "",
  };

  const queue = state?.queue ?? [];

  function navigateAfterAction() {
    const [next, ...rest] = queue;
    if (next) {
      navigate(`/review/${next.pendingId}`, {
        state: { extraction: next.extraction, fileName: next.fileName, mimeType: next.mimeType, queue: rest },
      });
    } else {
      navigate("/");
    }
  }

  const isVoiceEntry = !mimeType;

  return (
    <div className="h-full overflow-auto">
      <div className={`mx-auto px-4 py-6 pb-8 space-y-4 ${isVoiceEntry ? "max-w-lg" : "max-w-7xl"}`}>
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="text-muted-foreground hover:text-foreground transition-all duration-300 p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-display font-bold gradient-text">Beleg prüfen</h1>
            {state?.fileName && <p className="text-muted-foreground text-xs">{state.fileName}</p>}
          </div>
          {queue.length > 0 && (
            <span className="text-xs font-semibold text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
              Noch {queue.length} weitere{queue.length === 1 ? "r" : ""}
            </span>
          )}
        </div>

        {/* Info banner */}
        <div className="flat-card px-4 py-2.5 flex items-center gap-2 rounded-2xl">
          <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
          <p className="text-muted-foreground text-xs">KI hat die Felder extrahiert — bitte prüfen und ggf. korrigieren.</p>
        </div>

        {/* Duplicate warning */}
        {duplicate && (
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
        )}

        {isVoiceEntry ? (
          /* Form without preview (voice/text entry) */
          <div className="flat-card rounded-[32px] p-6 space-y-4">
            <ReceiptForm
              initial={initial}
              busy={busy}
              onValuesChange={handleValuesChange}
              submitDisabled={!!duplicate}
              onSubmit={async (values) => {
                setBusy(true);
                try {
                  await receiptsApi.confirm({ pendingId, ...values });
                  qc.invalidateQueries({ queryKey: ["receipts"] });
                  qc.invalidateQueries({ queryKey: ["stats"] });
                  qc.invalidateQueries({ queryKey: ["drive", "inbox"] });
                  toast({ title: "Beleg gespeichert" });
                  navigateAfterAction();
                } catch (e) {
                  toast({ title: "Speichern fehlgeschlagen", description: String((e as Error).message) });
                } finally {
                  setBusy(false);
                }
              }}
            />

            <div className="border-t border-border/20 pt-4">
              <button
                onClick={() => setShowDiscardConfirm(true)}
                disabled={busy}
                className="w-full h-10 rounded-xl border border-destructive/20 text-destructive hover:bg-destructive/5 font-semibold text-xs transition-all duration-300 flex items-center justify-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Beleg verwerfen (aus Warteschlange löschen)
              </button>
            </div>
          </div>
        ) : (
          /* Side-by-side or stacked grid layout for uploads/Drive imports */
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Left/Right Column: Document Preview (Sticky on desktop) */}
            <div className="md:col-span-6 space-y-4 md:sticky md:top-6">
              <ReviewPreview mimeType={mimeType} previewUrl={`${import.meta.env.VITE_API_URL ?? ""}/api/receipts/pending/${pendingId}/preview`} />
            </div>

            {/* Right/Left Column: Form */}
            <div className="md:col-span-6 space-y-4">
              <div className="flat-card rounded-[32px] p-6 space-y-4">
                <ReceiptForm
                  initial={initial}
                  busy={busy}
                  onValuesChange={handleValuesChange}
                  submitDisabled={!!duplicate}
                  onSubmit={async (values) => {
                    setBusy(true);
                    try {
                      await receiptsApi.confirm({ pendingId, ...values });
                      qc.invalidateQueries({ queryKey: ["receipts"] });
                      qc.invalidateQueries({ queryKey: ["stats"] });
                      qc.invalidateQueries({ queryKey: ["drive", "inbox"] });
                      toast({ title: "Beleg gespeichert" });
                      navigateAfterAction();
                    } catch (e) {
                      toast({ title: "Speichern fehlgeschlagen", description: String((e as Error).message) });
                    } finally {
                      setBusy(false);
                    }
                  }}
                />

                <div className="border-t border-border/20 pt-4">
                  <button
                    onClick={() => setShowDiscardConfirm(true)}
                    disabled={busy}
                    className="w-full h-10 rounded-xl border border-destructive/20 text-destructive hover:bg-destructive/5 font-semibold text-xs transition-all duration-300 flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Beleg verwerfen (aus Warteschlange löschen)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <Dialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Beleg verwerfen</DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm">
                Möchtest du diesen Beleg wirklich aus der Warteschlange verwerfen? Diese Aktion kann nicht rückgängig gemacht werden.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-3 mt-4">
              <Button variant="ghost" onClick={() => setShowDiscardConfirm(false)} className="flex-1">
                Abbrechen
              </Button>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={async () => {
                  setShowDiscardConfirm(false);
                  setBusy(true);
                  try {
                    await receiptsApi.deletePending(pendingId);
                    qc.invalidateQueries({ queryKey: ["drive", "inbox"] });
                    toast({ title: "Beleg verworfen" });
                    navigateAfterAction();
                  } catch (e) {
                    toast({ title: "Fehler beim Verwerfen", description: String((e as Error).message) });
                  } finally {
                    setBusy(false);
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
    </div>
  );
}

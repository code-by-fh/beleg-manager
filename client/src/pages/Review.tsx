import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ReceiptForm } from "@/components/receipts/ReceiptForm";
import { useToast } from "@/components/ui/use-toast";
import { receiptsApi } from "@/api/receipts";
import { useState, useEffect } from "react";
import type { Extraction, ReceiptRow } from "@/types/receipt";
import { CheckCircle2, ArrowLeft, AlertTriangle } from "lucide-react";

type LocationState = { extraction?: Extraction; fileName?: string } | null;

export function ReviewPage() {
  const { pendingId } = useParams<{ pendingId: string }>();
  const { state } = useLocation() as { state: LocationState };
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [duplicate, setDuplicate] = useState<ReceiptRow | null>(null);
  const [fetchedExtraction, setFetchedExtraction] = useState<Extraction | null>(null);
  const [fetchError, setFetchError] = useState(false);

  // If navigated to directly (e.g. from Telegram link), fetch extraction from server
  useEffect(() => {
    if (!pendingId || state?.extraction) return;
    receiptsApi.getPending(pendingId)
      .then((r) => setFetchedExtraction(r.extraction))
      .catch(() => setFetchError(true));
  }, [pendingId]);

  const extraction = state?.extraction ?? fetchedExtraction;

  useEffect(() => {
    if (!extraction) return;
    const { haendler, betrag, datum } = extraction;
    if (!haendler || betrag == null || !datum) return;
    receiptsApi.checkDuplicate(haendler, betrag, datum)
      .then((r) => setDuplicate(r.duplicate))
      .catch(() => {/* silent – duplicate check is non-critical */});
  }, [extraction]);

  if (!pendingId || fetchError) {
    return (
      <div className="h-full flex items-center justify-center px-6">
        <div className="clay-card-static p-6 max-w-sm w-full text-center space-y-3">
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
        <div className="clay-card-static p-6 max-w-sm w-full text-center">
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
    zahlungsmethode: extraction.zahlungsmethode ?? "Karte",
    rechnungsnummer: extraction.rechnungsnummer ?? "",
  };

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-lg mx-auto px-4 py-6 pb-8 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="text-muted-foreground hover:text-foreground transition-all duration-300 p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-display font-bold gradient-text">Beleg prüfen</h1>
            {state?.fileName && <p className="text-muted-foreground text-xs">{state.fileName}</p>}
          </div>
        </div>

        {/* Info banner */}
        <div className="clay-card-static px-4 py-2.5 flex items-center gap-2 rounded-2xl">
          <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
          <p className="text-muted-foreground text-xs">KI hat die Felder extrahiert — bitte prüfen und ggf. korrigieren.</p>
        </div>

        {/* Duplicate warning */}
        {duplicate && (
          <div className="flex items-start gap-2 rounded-2xl border border-yellow-400/40 bg-yellow-50/60 dark:bg-yellow-900/20 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-800 dark:text-yellow-200">
              Mögliches Duplikat: <strong>{duplicate.haendler}</strong> · {duplicate.betrag} {duplicate.waehrung} · {duplicate.datum}
            </p>
          </div>
        )}

        {/* Form */}
        <div className="clay-card-static rounded-[32px] p-6">
          <ReceiptForm
            initial={initial}
            busy={busy}
            onSubmit={async (values) => {
              setBusy(true);
              try {
                await receiptsApi.confirm({ pendingId, ...values });
                qc.invalidateQueries({ queryKey: ["receipts"] });
                qc.invalidateQueries({ queryKey: ["stats"] });
                qc.invalidateQueries({ queryKey: ["drive", "inbox"] });
                toast({ title: "Beleg gespeichert" });
                navigate("/");
              } catch (e) {
                toast({ title: "Speichern fehlgeschlagen", description: String((e as Error).message) });
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

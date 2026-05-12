import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReceiptForm } from "@/components/receipts/ReceiptForm";
import { useToast } from "@/components/ui/use-toast";
import { receiptsApi } from "@/api/receipts";
import { useState } from "react";
import type { Extraction } from "@/types/receipt";

type LocationState = { extraction?: Extraction; fileName?: string } | null;

export function ReviewPage() {
  const { pendingId } = useParams<{ pendingId: string }>();
  const { state } = useLocation() as { state: LocationState };
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  if (!pendingId || !state?.extraction) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Review nicht verfügbar</CardTitle>
          <CardDescription>
            Diese Review-Sitzung ist nicht mehr gültig (Browser-Refresh oder direkter Link). Bitte erneut hochladen.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const initial = {
    datum: state.extraction.datum ?? undefined,
    haendler: state.extraction.haendler ?? undefined,
    betrag: state.extraction.betrag ?? undefined,
    mwst: state.extraction.mwst ?? 0,
    waehrung: state.extraction.waehrung ?? "EUR",
    kategorie: state.extraction.kategorie ?? "Sonstiges",
    zahlungsmethode: state.extraction.zahlungsmethode ?? "Karte",
    rechnungsnummer: state.extraction.rechnungsnummer ?? "",
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Beleg überprüfen</CardTitle>
          <CardDescription>
            Vergleiche die extrahierten Felder und korrigiere bei Bedarf.{state.fileName ? ` (${state.fileName})` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}

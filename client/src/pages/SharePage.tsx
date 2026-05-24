import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { shareLinksApi } from "@/api/shareLinks";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import { ExternalLink, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const STATUS_LABELS: Record<string, string> = {
  pending:   "Ausstehend",
  unterwegs: "Unterwegs",
  accepted:  "Angenommen",
  rejected:  "Abgelehnt",
  cancelled: "Zurückgezogen",
};

const STATUS_CLS: Record<string, string> = {
  pending:   "bg-amber-100 text-amber-700",
  unterwegs: "bg-blue-100 text-blue-700",
  accepted:  "bg-green-100 text-green-700",
  rejected:  "bg-red-100 text-red-700",
  cancelled: "bg-zinc-100 text-zinc-600",
};

export function SharePage() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, error, isError } = useQuery({
    queryKey: ["share", token],
    queryFn: () => shareLinksApi.getPublic(token!),
    retry: false,
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Wird geladen…</p>
      </div>
    );
  }

  if (isError) {
    const msg = (error as Error).message ?? "";
    const isExpired = msg.includes("410");
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-sm w-full text-center flex flex-col items-center gap-3">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <p className="font-semibold text-foreground">
            {isExpired ? "Dieser Link ist abgelaufen" : "Dieser Link ist nicht mehr gültig"}
          </p>
          <p className="text-sm text-muted-foreground">
            Bitte den Absender bitten, einen neuen Link zu erstellen.
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const expiryDate = new Date(data.expiresAt).toLocaleDateString("de-DE", {
    day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground">
            Anforderungen für {data.personName}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Gültig bis {expiryDate}</p>
        </div>

        {data.requests.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Keine Anforderungen vorhanden.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {data.requests.map((r, i) => {
              const statusLabel = STATUS_LABELS[r.status] ?? r.status;
              const statusCls = STATUS_CLS[r.status] ?? "bg-zinc-100 text-zinc-600";
              return (
                <div key={i} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm text-foreground">{r.haendler}</p>
                      <p className="text-xs text-muted-foreground">{formatDateIso(r.datum)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="font-bold text-sm text-foreground">
                        {formatCurrency(r.betrag, r.waehrung)}
                      </span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusCls}`}>
                        {statusLabel}
                      </span>
                    </div>
                  </div>

                  {r.nachricht && (
                    <p className="text-xs text-muted-foreground border-t border-border/50 pt-2">
                      {r.nachricht}
                    </p>
                  )}

                  {r.driveFileUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-8 text-xs mt-1 gap-1.5"
                      onClick={() => window.open(r.driveFileUrl!, "_blank", "noopener,noreferrer")}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Beleg öffnen
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

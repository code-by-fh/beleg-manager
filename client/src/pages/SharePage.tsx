import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { shareLinksApi } from "@/api/shareLinks";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import { AlertCircle, FileText, Check, X, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const STATUS_LABELS: Record<string, string> = {
  pending:   "Ausstehend",
  accepted:  "Angenommen",
  rejected:  "Abgelehnt",
  cancelled: "Storniert",
  settled:   "Ausgeglichen",
};

const STATUS_CLS: Record<string, string> = {
  pending:   "bg-amber-100 text-amber-700",
  accepted:  "bg-green-100 text-green-700",
  rejected:  "bg-red-100 text-red-700",
  cancelled: "bg-zinc-100 text-zinc-600",
  settled:   "bg-blue-100 text-blue-700",
};

export function SharePage() {
  const { token } = useParams<{ token: string }>();
  const qc = useQueryClient();
  const [previewId, setPreviewId] = useState<string | null>(null);

  const { data, isLoading, error, isError } = useQuery({
    queryKey: ["share", token],
    queryFn: () => shareLinksApi.getPublic(token!),
    retry: false,
    enabled: !!token,
  });

  const statusMutation = useMutation({
    mutationFn: ({ requestId, status }: { requestId: string; status: "accepted" | "rejected" }) =>
      shareLinksApi.updateStatus(token!, requestId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["share", token] }),
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

  const previewRequest = previewId ? data.requests.find((r) => r.id === previewId) : null;
  const previewUrl = previewId ? shareLinksApi.receiptPreviewUrl(token!, previewId) : null;

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
            {data.requests.map((r) => {
              const statusLabel = STATUS_LABELS[r.status] ?? r.status;
              const statusCls = STATUS_CLS[r.status] ?? "bg-zinc-100 text-zinc-600";
              const isPending = r.status === "pending";
              const isBusy = statusMutation.isPending && statusMutation.variables?.requestId === r.id;

              return (
                <div key={r.id} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
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

                  <div className="flex flex-col gap-2 mt-1">
                    {r.hasReceipt && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-8 text-xs gap-1.5"
                        onClick={() => setPreviewId(r.id)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Beleg ansehen
                      </Button>
                    )}

                    {isPending && (
                      <div className="flex gap-2">
                        <Button
                          variant="default"
                          size="sm"
                          className="flex-1 h-8 text-xs gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                          disabled={isBusy}
                          onClick={() => statusMutation.mutate({ requestId: r.id, status: "accepted" })}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Annehmen
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-8 text-xs gap-1.5 border-red-300 text-red-600 hover:bg-red-50"
                          disabled={isBusy}
                          onClick={() => statusMutation.mutate({ requestId: r.id, status: "rejected" })}
                        >
                          <X className="h-3.5 w-3.5" />
                          Ablehnen
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!previewId} onOpenChange={(open) => { if (!open) setPreviewId(null); }}>
        <DialogContent className="max-w-2xl w-full p-0 overflow-hidden">
          {previewRequest && previewUrl && (
            <div className="flex flex-col">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  {previewRequest.haendler} – {formatDateIso(previewRequest.datum)}
                </p>
              </div>
              <div className="relative bg-zinc-50" style={{ height: "70vh" }}>
                <img
                  src={previewUrl}
                  alt="Beleg"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    // Fall back to PDF iframe if image fails
                    const el = e.currentTarget as HTMLImageElement;
                    const parent = el.parentElement!;
                    el.remove();
                    const iframe = document.createElement("iframe");
                    iframe.src = previewUrl;
                    iframe.className = "w-full h-full border-0";
                    parent.appendChild(iframe);
                  }}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

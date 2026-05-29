import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { shareLinksApi } from "@/api/shareLinks";
import { formatDateIso } from "@/lib/formatters";
import { AlertCircle, FileText } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ShareRequestCard } from "@/components/split-requests/ShareRequestCard";

export function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [previewId, setPreviewId] = useState<string | null>(null);

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

  const previewRequest = previewId ? data.requests.find((r: any) => r.id === previewId) : null;
  const previewUrl = previewId ? shareLinksApi.receiptPreviewUrl(token!, previewId) : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-10 min-h-screen flex flex-col w-full">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Anforderungen für {data.personName}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Gültig bis {expiryDate}</p>
        </div>

        {data.requests.length === 0 ? (
          <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/50 text-center py-10 px-4">
            <p className="text-sm text-muted-foreground">
              Keine Anforderungen vorhanden.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 flex-1">
            {data.requests.map((r: any) => (
              <ShareRequestCard
                key={r.id}
                request={r}
                token={token!}
                personName={data.personName}
                onPreview={setPreviewId}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!previewId} onOpenChange={open => { if (!open) setPreviewId(null); }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-2xl p-0 overflow-hidden sm:rounded-2xl mx-auto">
          {previewRequest && previewUrl && (
            <div className="flex flex-col h-[75vh] sm:h-auto max-h-[85vh]">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2 bg-card">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <p className="text-sm font-semibold text-foreground truncate">
                    {previewRequest.haendler} – {formatDateIso(previewRequest.datum)}
                  </p>
                </div>
              </div>
              <div className="relative flex-1 bg-zinc-50 dark:bg-zinc-950 min-h-[40vh] h-full overflow-hidden">
                <img
                  src={previewUrl}
                  alt="Beleg"
                  className="w-full h-full object-contain"
                  onError={e => {
                    const el = e.currentTarget;
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

import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { shareLinksApi } from "@/api/shareLinks";
import { AlertCircle } from "lucide-react";
import { ShareRequestCard } from "@/components/split-requests/ShareRequestCard";

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
    <div className="h-[100dvh] overflow-y-auto bg-background flex flex-col">
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-10 min-h-full flex flex-col w-full">
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

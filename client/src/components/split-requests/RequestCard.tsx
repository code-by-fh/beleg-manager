import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import { useUpdateRequestStatus, useDeleteRequest, useAdjustRequest } from "@/hooks/useSplitRequests";
import { useToast } from "@/components/ui/use-toast";
import { ReceiptDetailModal } from "@/components/receipts/ReceiptDetailModal";
import { splitRequestsApi } from "@/api/splitRequests";
import type { IncomingRequest, OutgoingRequest } from "@/api/splitRequests";

const STATUS_LABELS: Record<string, string> = {
  pending:   "Ausstehend",
  accepted:  "Angenommen",
  angepasst: "Angepasst",
  rejected:  "Abgelehnt",
  cancelled: "Storniert",
  settled:   "Ausgeglichen",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending:   "default",
  accepted:  "secondary",
  angepasst: "outline",
  rejected:  "destructive",
  cancelled: "outline",
  settled:   "secondary",
};

type IncomingCardProps = { request: IncomingRequest };
type OutgoingCardProps = { request: OutgoingRequest };

export function IncomingRequestCard({ request }: IncomingCardProps) {
  const { toast } = useToast();
  const updateStatus = useUpdateRequestStatus();
  const adjustMutation = useAdjustRequest();
  const [modalOpen, setModalOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<"beleg" | "aufteilen">("beleg");

  async function handleStatus(status: "accepted" | "rejected") {
    try {
      await updateStatus.mutateAsync({ id: request.id, status });
      toast({ title: status === "accepted" ? "Angenommen" : "Abgelehnt" });
    } catch {
      toast({ title: "Fehler", variant: "destructive" });
    }
  }

  const meta = request.receiptMeta;

  const mockReceipt = {
    id: request.receiptSqliteId || request.receiptId || request.id,
    user_id: "",
    datum: meta.datum,
    haendler: meta.haendler,
    betrag: meta.gesamtbetrag, // total receipt amount!
    mwst: 0,
    trinkgeld: 0,
    waehrung: meta.waehrung,
    kategorie: "",
    zahlungsmethode: "",
    rechnungsnummer: "",
    driveLink: request.receiptId ? "mock" : "", // represents having a file
    eingabe_typ: "foto",
    erstellt_am: "",
  };

  const previewUrl = request.receiptId ? splitRequestsApi.receiptPreviewUrl(request.id) : undefined;
  const canEdit = (request.status === "pending" || request.status === "accepted" || request.status === "angepasst") && request.positions && request.positions.length > 0;

  return (
    <>
      <Card className="overflow-hidden border-border bg-card shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {request.fromUser?.name ?? "Unbekannt"}
              </p>
              <p className="text-xs text-muted-foreground truncate">{request.fromUser?.email}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {!request.adjustedByRecipient && (
                <Badge
                  variant={STATUS_VARIANTS[request.status]}
                  className="font-semibold text-[10px] tracking-wide uppercase px-2 py-0.5 flex-shrink-0"
                >
                  {STATUS_LABELS[request.status]}
                </Badge>
              )}
              {request.adjustedByRecipient === 1 && (
                <Badge variant="outline" className="font-semibold text-[10px] tracking-wide uppercase px-2 py-0.5 flex-shrink-0 border-orange-200 text-orange-700 bg-orange-50 animate-pulse">
                  Angepasst (Freigabe ausstehend)
                </Badge>
              )}
              {request.adjustedByRecipient === 2 && (
                <Badge variant="outline" className="font-semibold text-[10px] tracking-wide uppercase px-2 py-0.5 flex-shrink-0 border-emerald-200 text-emerald-700 bg-emerald-50">
                  Angepasst (Freigegeben)
                </Badge>
              )}
            </div>
          </div>

          <div className="p-3 bg-muted/30 rounded-lg flex items-center justify-between gap-4 text-sm">
            <div className="min-w-0">
              <p className="font-semibold text-foreground truncate">{meta.haendler}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{formatDateIso(meta.datum)}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="font-bold text-base text-foreground">
                {formatCurrency(request.betrag, meta.waehrung)}
              </span>
            </div>
          </div>

          {request.nachricht && (
            <div className="px-3 py-2 bg-primary/5 rounded-lg border-l-2 border-primary/20">
              <p className="text-xs text-muted-foreground italic">„{request.nachricht}"</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            {request.receiptId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setInitialTab("beleg"); setModalOpen(true); }}
                className="w-full sm:w-auto h-9 text-xs font-medium"
              >
                Beleg ansehen
              </Button>
            )}
            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setInitialTab("aufteilen"); setModalOpen(true); }}
                className="w-full sm:w-auto h-9 text-xs font-medium border-primary/30 text-primary hover:bg-primary/5"
              >
                Anpassen
              </Button>
            )}
            {request.status === "pending" && (
              <div className="flex gap-2 flex-1 w-full sm:w-auto">
                <Button
                  size="sm"
                  onClick={() => handleStatus("accepted")}
                  disabled={updateStatus.isPending}
                  className="flex-1 sm:flex-none h-9 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/95"
                >
                  Annehmen
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleStatus("rejected")}
                  disabled={updateStatus.isPending}
                  className="flex-1 sm:flex-none h-9 text-xs font-medium"
                >
                  Ablehnen
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <ReceiptDetailModal
        receipt={modalOpen ? (mockReceipt as any) : null}
        initialTab={initialTab}
        onClose={() => setModalOpen(false)}
        onEdit={async () => {}}
        editBusy={false}
        existingSplits={[]}
        isRecipient={true}
        recipientRequest={request}
        customPreviewUrl={previewUrl}
        onAdjustSplit={async (betrag, positions) => {
          try {
            await adjustMutation.mutateAsync({ id: request.id, betrag, positions });
            toast({ title: "Aufteilung angepasst & akzeptiert!" });
            setModalOpen(false);
          } catch {
            toast({ title: "Fehler beim Anpassen", variant: "destructive" });
          }
        }}
      />
    </>
  );
}

export function OutgoingRequestCard({ request }: OutgoingCardProps) {
  const { toast } = useToast();
  const updateStatus = useUpdateRequestStatus();
  const deleteRequest = useDeleteRequest();
  const meta = request.receiptMeta;

  async function handleCancel() {
    try {
      await updateStatus.mutateAsync({ id: request.id, status: "cancelled" });
      toast({ title: "Zurückgezogen" });
    } catch {
      toast({ title: "Fehler", variant: "destructive" });
    }
  }

  async function handleDelete() {
    try {
      await deleteRequest.mutateAsync(request.id);
      toast({ title: "Gelöscht" });
    } catch {
      toast({ title: "Fehler", variant: "destructive" });
    }
  }

  return (
    <Card className="overflow-hidden border-border bg-card shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4 sm:p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {request.toUser?.name ?? "Unbekannt"}
            </p>
            <p className="text-xs text-muted-foreground truncate">{request.toUser?.email}</p>
          </div>
          <Badge 
            variant={STATUS_VARIANTS[request.status]}
            className="font-semibold text-[10px] tracking-wide uppercase px-2 py-0.5 flex-shrink-0"
          >
            {STATUS_LABELS[request.status]}
          </Badge>
        </div>

        <div className="p-3 bg-muted/30 rounded-lg flex items-center justify-between gap-4 text-sm">
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate">{meta.haendler}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatDateIso(meta.datum)}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <span className="font-bold text-base text-foreground">
              {formatCurrency(request.betrag, meta.waehrung)}
            </span>
          </div>
        </div>

        {request.nachricht && (
          <div className="px-3 py-2 bg-primary/5 rounded-lg border-l-2 border-primary/20">
            <p className="text-xs text-muted-foreground italic">„{request.nachricht}"</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          {request.status === "pending" && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancel}
              disabled={updateStatus.isPending}
              className="w-full sm:w-auto h-9 text-xs font-medium hover:bg-red-500/5 hover:text-red-500 hover:border-red-500/30"
            >
              Zurückziehen
            </Button>
          )}
          {(request.status === "cancelled" || request.status === "rejected") && (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteRequest.isPending}
              className="w-full sm:w-auto h-9 text-xs font-medium"
            >
              Löschen
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

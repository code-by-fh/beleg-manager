import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import { useUpdateRequestStatus, useDeleteRequest } from "@/hooks/useSplitRequests";
import { useToast } from "@/components/ui/use-toast";
import { ReceiptPreviewModal } from "./ReceiptPreviewModal";
import type { IncomingRequest, OutgoingRequest } from "@/api/splitRequests";

const STATUS_LABELS: Record<string, string> = {
  pending: "Ausstehend",
  accepted: "Angenommen",
  rejected: "Abgelehnt",
  cancelled: "Zurückgezogen",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "default",
  accepted: "secondary",
  rejected: "destructive",
  cancelled: "outline",
};

type IncomingCardProps = { request: IncomingRequest };
type OutgoingCardProps = { request: OutgoingRequest };

export function IncomingRequestCard({ request }: IncomingCardProps) {
  const { toast } = useToast();
  const updateStatus = useUpdateRequestStatus();
  const [previewOpen, setPreviewOpen] = useState(false);

  async function handleStatus(status: "accepted" | "rejected") {
    try {
      await updateStatus.mutateAsync({ id: request.id, status });
      toast({ title: status === "accepted" ? "Angenommen" : "Abgelehnt" });
    } catch {
      toast({ title: "Fehler", variant: "destructive" });
    }
  }

  const meta = request.receiptMeta;

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
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPreviewOpen(true)}
              className="w-full sm:w-auto h-9 text-xs font-medium"
            >
              Beleg ansehen
            </Button>
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
      <ReceiptPreviewModal request={request} open={previewOpen} onClose={() => setPreviewOpen(false)} />
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

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
      <Card>
        <CardContent className="pt-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{request.fromUser?.name ?? "Unbekannt"}</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">{request.fromUser?.email}</p>
            </div>
            <Badge variant={STATUS_VARIANTS[request.status]}>{STATUS_LABELS[request.status]}</Badge>
          </div>
          <div className="flex gap-4 text-sm flex-wrap">
            <span className="font-medium">{meta.haendler}</span>
            <span className="text-[hsl(var(--muted-foreground))]">{formatDateIso(meta.datum)}</span>
            <span className="ml-auto font-bold">{formatCurrency(request.betrag, meta.waehrung)}</span>
          </div>
          {request.nachricht && (
            <p className="text-xs text-[hsl(var(--muted-foreground))] italic">„{request.nachricht}"</p>
          )}
          <div className="flex gap-2 pt-1 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>
              Beleg ansehen
            </Button>
            {request.status === "pending" && (
              <>
                <Button
                  size="sm"
                  onClick={() => handleStatus("accepted")}
                  disabled={updateStatus.isPending}
                >
                  Annehmen
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleStatus("rejected")}
                  disabled={updateStatus.isPending}
                >
                  Ablehnen
                </Button>
              </>
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
    <Card>
      <CardContent className="pt-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium">{request.toUser?.name ?? "Unbekannt"}</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{request.toUser?.email}</p>
          </div>
          <Badge variant={STATUS_VARIANTS[request.status]}>{STATUS_LABELS[request.status]}</Badge>
        </div>
        <div className="flex gap-4 text-sm flex-wrap">
          <span className="font-medium">{meta.haendler}</span>
          <span className="text-[hsl(var(--muted-foreground))]">{formatDateIso(meta.datum)}</span>
          <span className="ml-auto font-bold">{formatCurrency(request.betrag, meta.waehrung)}</span>
        </div>
        {request.nachricht && (
          <p className="text-xs text-[hsl(var(--muted-foreground))] italic">„{request.nachricht}"</p>
        )}
        <div className="flex gap-2 pt-1 flex-wrap">
          {request.status === "pending" && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancel}
              disabled={updateStatus.isPending}
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
            >
              Löschen
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

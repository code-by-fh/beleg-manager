import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { splitRequestsApi, type IncomingRequest } from "@/api/splitRequests";
import { formatCurrency, formatDateIso } from "@/lib/formatters";

type Props = {
  request: IncomingRequest;
  open: boolean;
  onClose: () => void;
};

export function ReceiptPreviewModal({ request, open, onClose }: Props) {
  const previewUrl = splitRequestsApi.receiptPreviewUrl(request.id);
  const meta = request.receiptMeta;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl w-full">
        <DialogHeader>
          <DialogTitle>Beleg von {request.fromUser?.name ?? "Unbekannt"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1 min-h-48 bg-[var(--surface)] rounded-lg overflow-hidden flex items-center justify-center">
            <object
              data={previewUrl}
              className="max-w-full max-h-[500px] w-full"
              aria-label="Beleg Vorschau"
            >
              <p className="text-sm text-[hsl(var(--muted-foreground))] p-4">Vorschau nicht verfügbar</p>
            </object>
          </div>
          <div className="flex flex-col gap-3 min-w-[180px]">
            <div>
              <p className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-0.5">Händler</p>
              <p className="text-sm font-medium">{meta.haendler}</p>
            </div>
            <div>
              <p className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-0.5">Datum</p>
              <p className="text-sm font-medium">{formatDateIso(meta.datum)}</p>
            </div>
            <div>
              <p className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-0.5">Gesamtbetrag</p>
              <p className="text-sm font-medium">{formatCurrency(meta.gesamtbetrag, meta.waehrung)}</p>
            </div>
            <div>
              <p className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-0.5">Angeforderter Betrag</p>
              <p className="text-base font-bold text-[hsl(var(--foreground))]">{formatCurrency(request.betrag, meta.waehrung)}</p>
            </div>
            {request.nachricht && (
              <div>
                <p className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-0.5">Nachricht</p>
                <p className="text-sm">{request.nachricht}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

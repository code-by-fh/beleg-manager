import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search } from "lucide-react";
import { bankApi } from "@/api/bank";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import type { ReceiptRow } from "@/types/receipt";

type Props = {
  receipt: ReceiptRow | null;
  onClose: () => void;
  onAssigned: () => void;
};

export function KontobewegungZuordnenDialog({ receipt, onClose, onAssigned }: Props) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (receipt) setSearch("");
  }, [receipt?.id]);

  const { data, isLoading } = useQuery({
    queryKey: ["bank-transactions"],
    queryFn: () => bankApi.listTransactions(),
    enabled: receipt !== null,
  });

  const candidates = useMemo(() => {
    const txs = (data?.transactions ?? []).filter(
      (tx) => tx.matchStatus === "unmatched" || tx.matchedReceiptId === receipt?.id
    );
    if (!search.trim()) return txs;
    const q = search.toLowerCase();
    return txs.filter(
      (tx) =>
        tx.haendler.toLowerCase().includes(q) ||
        tx.verwendungszweck.toLowerCase().includes(q)
    );
  }, [data, search, receipt?.id]);

  async function handleAssign(txId: string) {
    if (!receipt) return;
    setBusy(true);
    try {
      await bankApi.matchTransaction(txId, receipt.id);
      toast({ title: "Kontobewegung zugeordnet" });
      onClose();
      onAssigned();
    } catch {
      toast({ title: "Zuordnung fehlgeschlagen", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={receipt !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Kontobewegung zuordnen</DialogTitle>
          {receipt && (
            <DialogDescription>
              <span className="font-medium text-foreground">{receipt.haendler}</span>
              {" · "}
              {formatCurrency(receipt.betrag, receipt.waehrung)}
              {" · "}
              {formatDateIso(receipt.datum)}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Händler oder Verwendungszweck suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <div className="max-h-64 overflow-y-auto rounded-md border border-border">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">
              Keine offenen Kontobewegungen gefunden.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Datum</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Händler</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Betrag</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((tx) => (
                  <tr
                    key={tx.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-3 py-2 text-muted-foreground">{formatDateIso(tx.buchungsdatum)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium leading-tight">{tx.haendler}</div>
                      {tx.verwendungszweck && (
                        <div className="text-xs text-muted-foreground truncate max-w-[160px]">
                          {tx.verwendungszweck}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {tx.betrag < 0 ? (
                        <span className="text-red-500 font-medium">−{formatCurrency(Math.abs(tx.betrag))}</span>
                      ) : (
                        <span className="text-green-600 font-medium">{formatCurrency(tx.betrag)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" disabled={busy} onClick={() => handleAssign(tx.id)}>
                        {tx.matchedReceiptId === receipt?.id ? "Erneut zuordnen" : "Zuordnen"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

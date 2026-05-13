import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
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
import { receiptsApi } from "@/api/receipts";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import type { BankTransaction } from "@/types/bank";

type Props = {
  transaction: BankTransaction | null;
  onClose: () => void;
  onAssigned: () => void;
  alreadyMatchedReceiptIds: Set<string>;
};

export function BelegZuordnenDialog({ transaction, onClose, onAssigned, alreadyMatchedReceiptIds }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (transaction) setSearch("");
  }, [transaction?.id]);

  const { data, isLoading } = useQuery({
    queryKey: ["receipts"],
    queryFn: () => receiptsApi.list(),
    enabled: transaction !== null,
  });

  const filtered = useMemo(() => {
    const rows = (data?.rows ?? []).filter((r) => !alreadyMatchedReceiptIds.has(r.id));
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => r.haendler.toLowerCase().includes(q));
  }, [data, search, alreadyMatchedReceiptIds]);

  async function handleAssign(receiptId: string) {
    if (!transaction) return;
    setBusy(true);
    try {
      await bankApi.matchTransaction(transaction.id, receiptId);
      toast({ title: "Beleg zugeordnet" });
      onClose();
      onAssigned();
    } catch {
      toast({ title: "Zuordnung fehlgeschlagen", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={transaction !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Beleg zuordnen</DialogTitle>
          {transaction && (
            <DialogDescription>
              <span className="font-medium text-foreground">{transaction.haendler}</span>
              {" · "}
              <span className={transaction.betrag < 0 ? "text-red-500" : "text-green-600"}>
                {transaction.betrag < 0
                  ? `−${formatCurrency(Math.abs(transaction.betrag))}`
                  : formatCurrency(transaction.betrag)}
              </span>
              {" · "}
              {formatDateIso(transaction.buchungsdatum)}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Händler suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <div className="max-h-64 overflow-y-auto rounded-md border border-border">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">
              Keine Belege gefunden.
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
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 text-muted-foreground">{formatDateIso(r.datum)}</td>
                    <td className="px-3 py-2 font-medium">{r.haendler}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(r.betrag, r.waehrung)}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" disabled={busy} onClick={() => handleAssign(r.id)}>
                        Zuordnen
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
          <Button
            variant="link"
            className="px-0 text-sm text-muted-foreground"
            onClick={() => { onClose(); navigate("/upload"); }}
          >
            + Neuen Beleg anlegen
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
import { Search, Receipt } from "lucide-react";
import { bankApi } from "@/api/bank";
import { splitsApi } from "@/api/splits";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import type { SplitRow } from "@/types/receipt";

type Props = {
  split: SplitRow | null;
  onClose: () => void;
  onLinked: () => void;
};

export function SplitBankTxDialog({ split, onClose, onLinked }: Props) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (split) setSearch("");
  }, [split?.splitId]);

  const { data, isLoading } = useQuery({
    queryKey: ["bank-transactions"],
    queryFn: () => bankApi.listTransactions(),
    enabled: split !== null,
  });

  // Show positive transactions (incoming payments = potential repayments)
  const candidates = useMemo(() => {
    const txs = (data?.transactions ?? []).filter(
      (tx) => tx.betrag > 0 && tx.matchStatus !== "ignored"
    );
    if (!search.trim()) return txs;
    const q = search.toLowerCase();
    return txs.filter(
      (tx) =>
        tx.haendler.toLowerCase().includes(q) ||
        tx.verwendungszweck.toLowerCase().includes(q)
    );
  }, [data, search]);

  async function handleLink(bankTxId: string) {
    if (!split) return;
    setBusy(true);
    try {
      await splitsApi.linkBankTx(split.splitId, bankTxId);
      toast({ title: "Kontobewegung verknüpft" });
      onClose();
      onLinked();
    } catch {
      toast({ title: "Verknüpfung fehlgeschlagen", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlink() {
    if (!split) return;
    setBusy(true);
    try {
      await splitsApi.linkBankTx(split.splitId, null);
      toast({ title: "Verknüpfung aufgehoben" });
      onClose();
      onLinked();
    } catch {
      toast({ title: "Fehler", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={split !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Kontobewegung verknüpfen</DialogTitle>
          {split && (
            <DialogDescription>
              <span className="font-medium text-foreground">{split.person}</span>
              {" schuldet "}
              <span className="font-medium text-foreground">{formatCurrency(split.betrag, split.waehrung)}</span>
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Linked receipt card */}
        {split && (
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
            <Receipt className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Verknüpfter Beleg</p>
              <p className="font-medium text-sm">{split.haendler}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateIso(split.datum)} · {formatCurrency(split.gesamtbetrag, split.waehrung)} gesamt
              </p>
            </div>
          </div>
        )}

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
              Keine positiven Kontobewegungen gefunden.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Datum</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Auftraggeber</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Betrag</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((tx) => (
                  <tr
                    key={tx.id}
                    className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${
                      tx.id === split?.linkedBankTxId ? "bg-green-50 dark:bg-green-950/20" : ""
                    }`}
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
                      <span className="text-green-600 font-medium">{formatCurrency(tx.betrag)}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        disabled={busy}
                        variant={tx.id === split?.linkedBankTxId ? "outline" : "default"}
                        onClick={() => handleLink(tx.id)}
                      >
                        {tx.id === split?.linkedBankTxId ? "Erneut zuordnen" : "Zuordnen"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
          {split?.linkedBankTxId && (
            <Button variant="ghost" className="text-destructive hover:text-destructive px-0 text-sm" disabled={busy} onClick={handleUnlink}>
              Verknüpfung aufheben
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} className="sm:ml-auto">Abbrechen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

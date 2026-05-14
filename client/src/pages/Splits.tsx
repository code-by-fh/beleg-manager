import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { splitsApi } from "@/api/splits";
import { bankApi } from "@/api/bank";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Circle, Trash2, Link2, ArrowLeftRight } from "lucide-react";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import { SplitBankTxDialog } from "@/components/bank/SplitBankTxDialog";
import type { SplitRow } from "@/types/receipt";

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ split }: { split: SplitRow }) {
  if (split.linkedBankTxId) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold uppercase tracking-wider">
        <ArrowLeftRight className="h-3 w-3" />
        Ausgeglichen
      </span>
    );
  }
  if (split.beglichen) {
    return (
      <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold uppercase tracking-wider">
        Beglichen
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wider">
      Offen
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function SplitsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["splits"], queryFn: () => splitsApi.list() });
  const { data: bankData } = useQuery({ queryKey: ["bank-transactions"], queryFn: () => bankApi.listTransactions() });
  const qc = useQueryClient();
  const { toast } = useToast();
  const [linkSplit, setLinkSplit] = useState<SplitRow | null>(null);

  const splits = data?.splits ?? [];

  // Map bank tx id → tx for info display
  const txMap = useMemo(() => {
    const m = new Map<string, { haendler: string; buchungsdatum: string; betrag: number }>();
    for (const tx of bankData?.transactions ?? []) m.set(tx.id, tx);
    return m;
  }, [bankData]);

  // Group splits by receiptId — each group is one Beleg
  const byReceipt = useMemo(() => {
    const map = new Map<string, SplitRow[]>();
    for (const s of splits) {
      const list = map.get(s.receiptId) ?? [];
      list.push(s);
      map.set(s.receiptId, list);
    }
    // Sort each group by erstelltAm
    for (const list of map.values()) list.sort((a, b) => a.erstelltAm.localeCompare(b.erstelltAm));
    return map;
  }, [splits]);

  // Summary stats
  const totalOpen = splits.filter((s) => !s.beglichen && !s.linkedBankTxId).reduce((sum, s) => sum + s.betrag, 0);
  const totalSettled = splits.filter((s) => s.beglichen || s.linkedBankTxId).reduce((sum, s) => sum + s.betrag, 0);

  async function toggleSettled(split: SplitRow) {
    try {
      await splitsApi.markSettled(split.splitId, !split.beglichen);
      qc.invalidateQueries({ queryKey: ["splits"] });
    } catch {
      toast({ title: "Fehler", variant: "destructive" });
    }
  }

  async function handleDelete(id: string) {
    try {
      await splitsApi.delete(id);
      qc.invalidateQueries({ queryKey: ["splits"] });
      toast({ title: "Eintrag gelöscht" });
    } catch {
      toast({ title: "Fehler beim Löschen", variant: "destructive" });
    }
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Aufteilungen</h1>
        <p className="text-muted-foreground text-sm">Wer schuldet dir was?</p>
      </div>

      {/* Summary */}
      {splits.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-card p-4 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Offen</p>
            <p className="text-2xl font-bold text-amber-600">{formatCurrency(totalOpen)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ausgeglichen</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalSettled)}</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {byReceipt.size === 0 && (
        <div className="rounded-xl border border-border bg-muted/20 p-10 text-center text-muted-foreground text-sm">
          Noch keine Aufteilungen. Teile Belege in der Belegliste auf.
        </div>
      )}

      {/* Receipt groups */}
      {[...byReceipt.entries()].map(([receiptId, items]) => {
        const first = items[0]!;
        const allSettled = items.every((s) => s.beglichen || s.linkedBankTxId);
        const openCount = items.filter((s) => !s.beglichen && !s.linkedBankTxId).length;

        return (
          <div key={receiptId} className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Receipt header */}
            <div className={`px-5 py-4 flex items-center justify-between border-b border-border ${allSettled ? "bg-green-50/50 dark:bg-green-950/10" : "bg-muted/20"}`}>
              <div>
                <p className="font-semibold">{first.haendler}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDateIso(first.datum)} · Gesamt {formatCurrency(first.gesamtbetrag, first.waehrung)}
                </p>
              </div>
              <div className="text-right">
                {allSettled ? (
                  <span className="text-xs font-medium text-green-600">Alle ausgeglichen ✓</span>
                ) : (
                  <span className="text-xs font-medium text-amber-600">{openCount} offen</span>
                )}
              </div>
            </div>

            {/* Split rows */}
            <div className="divide-y divide-border">
              {items.map((s) => {
                const linkedTx = s.linkedBankTxId ? txMap.get(s.linkedBankTxId) : undefined;
                const isSettled = s.beglichen || !!s.linkedBankTxId;

                return (
                  <div
                    key={s.splitId}
                    className={`px-5 py-3 flex items-start gap-3 transition-colors ${isSettled ? "opacity-60" : ""}`}
                  >
                    {/* Toggle button */}
                    <button
                      onClick={() => toggleSettled(s)}
                      className="flex-shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
                      title={s.beglichen ? "Als offen markieren" : "Als beglichen markieren"}
                    >
                      {s.beglichen ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <Circle className="h-4 w-4" />
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium ${isSettled ? "line-through" : ""}`}>{s.person}</span>
                        <StatusBadge split={s} />
                      </div>
                      {/* Linked bank tx info */}
                      {linkedTx && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <ArrowLeftRight className="h-3 w-3 inline mr-1" />
                          {linkedTx.haendler} · {formatDateIso(linkedTx.buchungsdatum)} · {formatCurrency(linkedTx.betrag)}
                        </p>
                      )}
                    </div>

                    {/* Amount */}
                    <span className="font-bold flex-shrink-0 text-sm">{formatCurrency(s.betrag, s.waehrung)}</span>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-7 w-7 ${s.linkedBankTxId ? "text-green-600 hover:text-green-700" : "text-muted-foreground hover:text-foreground"}`}
                        title={s.linkedBankTxId ? "Kontobewegung ändern" : "Kontobewegung zuordnen"}
                        onClick={() => setLinkSplit(s)}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleDelete(s.splitId)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <SplitBankTxDialog
        split={linkSplit}
        onClose={() => setLinkSplit(null)}
        onLinked={() => {
          setLinkSplit(null);
          qc.invalidateQueries({ queryKey: ["splits"] });
        }}
      />
    </div>
  );
}

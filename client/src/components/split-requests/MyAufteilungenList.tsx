import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link2, ArrowLeftRight, Trash2 } from "lucide-react";
import { useOutgoingRequests, useUpdateRequestStatus, useDeleteRequest } from "@/hooks/useSplitRequests";
import { useToast } from "@/components/ui/use-toast";
import { bankApi } from "@/api/bank";
import { SplitBankTxDialog } from "@/components/bank/SplitBankTxDialog";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import type { OutgoingRequest, SplitRequestStatus } from "@/api/splitRequests";

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Ausstehend",    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  accepted:  { label: "Angenommen",   cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  rejected:  { label: "Abgelehnt",    cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  cancelled: { label: "Zurückgezogen", cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
  settled:   { label: "Ausgeglichen", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
};

function getStatusKey(
  r: OutgoingRequest,
  txMap: Map<string, { betrag: number }>,
): string {
  if (!r.linkedBankTxId) return r.status;
  // Only "settled" when the linked transaction is an incoming payment (positive amount).
  // A negative tx is the original expense (e.g. split created from Kontoabgleich) — not a settlement.
  const tx = txMap.get(r.linkedBankTxId);
  return tx && tx.betrag > 0 ? "settled" : r.status;
}

export function MyAufteilungenList() {
  const { data, isLoading } = useOutgoingRequests();
  const { data: bankData } = useQuery({ queryKey: ["bank-transactions"], queryFn: () => bankApi.listTransactions() });
  const qc = useQueryClient();
  const { toast } = useToast();
  const deleteRequest = useDeleteRequest();
  const updateStatus = useUpdateRequestStatus();
  const [linkSplit, setLinkSplit] = useState<OutgoingRequest | null>(null);

  const txMap = useMemo(() => {
    const m = new Map<string, { haendler: string; buchungsdatum: string; betrag: number }>();
    for (const tx of bankData?.transactions ?? []) m.set(tx.id, tx);
    return m;
  }, [bankData]);

  const groups = useMemo(() => {
    const requests = data?.requests ?? [];
    const map = new Map<string, OutgoingRequest[]>();
    for (const r of requests) {
      const key = r.receiptSqliteId ?? r.receiptId ?? r.id;
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.createdAt - b.createdAt);
    return [...map.values()];
  }, [data]);

  async function handleStatusChange(id: string, status: SplitRequestStatus) {
    try {
      await updateStatus.mutateAsync({ id, status });
    } catch {
      toast({ title: "Fehler beim Aktualisieren", variant: "destructive" });
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteRequest.mutateAsync(id);
      toast({ title: "Gelöscht" });
    } catch {
      toast({ title: "Fehler beim Löschen", variant: "destructive" });
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Noch keine Aufteilungen. Teile Belege in der Belegliste auf.
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {groups.map((items) => {
          const first = items[0]!;
          const meta = first.receiptMeta;
          return (
            <div key={first.receiptSqliteId ?? first.receiptId ?? first.id} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 bg-muted/20 border-b border-border flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">{meta.haendler}</p>
                  <p className="text-xs text-muted-foreground">{formatDateIso(meta.datum)} · {formatCurrency(meta.gesamtbetrag, meta.waehrung)}</p>
                </div>
              </div>
              <div className="divide-y divide-border">
                {items.map((r) => {
                  const sk = getStatusKey(r, txMap);
                  const { label, cls } = STATUS_CONFIG[sk] ?? STATUS_CONFIG["pending"]!;
                  const linkedTx = r.linkedBankTxId ? txMap.get(r.linkedBankTxId) : undefined;
                  const personName = r.toUser?.name ?? r.freeName ?? "—";
                  return (
                    <div 
                      key={r.id} 
                      className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 hover:bg-muted/5 transition-colors"
                    >
                      <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <div className="flex items-center justify-between sm:justify-start gap-2">
                          <span className="font-semibold text-sm text-foreground">{personName}</span>
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${cls}`}>
                              {label}
                            </span>
                            <span className="font-bold text-sm sm:hidden text-foreground">
                              {formatCurrency(r.betrag, meta.waehrung)}
                            </span>
                          </div>
                        </div>
                        {linkedTx && (
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 min-w-0">
                            <ArrowLeftRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/75" />
                            <span className="truncate">
                              {linkedTx.haendler} · {formatDateIso(linkedTx.buchungsdatum)} · {formatCurrency(linkedTx.betrag)}
                            </span>
                          </p>
                        )}
                      </div>

                      <span className="hidden sm:inline font-bold text-sm flex-shrink-0 text-foreground">
                        {formatCurrency(r.betrag, meta.waehrung)}
                      </span>

                      {/* Controls Row */}
                      <div className="flex items-center justify-between sm:justify-end gap-2 border-t border-border/40 pt-2.5 sm:pt-0 sm:border-0 flex-wrap">
                        {/* Status Select / Cancel Button */}
                        <div className="flex-1 sm:flex-none">
                          {!r.linkedBankTxId && r.freeName && (
                            <Select
                              value={r.status}
                              onValueChange={(v) => handleStatusChange(r.id, v as SplitRequestStatus)}
                              disabled={updateStatus.isPending}
                            >
                              <SelectTrigger className="h-8 w-full sm:w-36 text-xs px-2.5 py-1 shadow-none bg-background hover:bg-muted/50 transition-colors">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Ausstehend</SelectItem>
                                <SelectItem value="accepted">Ausgeglichen</SelectItem>
                                <SelectItem value="cancelled">Storniert</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                          {!r.linkedBankTxId && r.toUser && r.status === "pending" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-full sm:w-auto text-xs px-3 hover:bg-red-500/5 hover:text-red-500 hover:border-red-500/30"
                              onClick={() => handleStatusChange(r.id, "cancelled")}
                              disabled={updateStatus.isPending}
                            >
                              Zurückziehen
                            </Button>
                          )}
                        </div>

                        {/* Link / Trash Action Buttons */}
                        <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 rounded-lg transition-colors ${
                              r.linkedBankTxId 
                                ? "bg-green-500/10 text-green-600 hover:bg-green-500/20 hover:text-green-700" 
                                : "text-muted-foreground hover:bg-muted"
                            }`}
                            title={r.linkedBankTxId ? "Kontobewegung ändern" : "Kontobewegung zuordnen"}
                            onClick={() => setLinkSplit(r)}
                          >
                            <Link2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-destructive transition-colors"
                            onClick={() => handleDelete(r.id)}
                            disabled={deleteRequest.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <SplitBankTxDialog
        split={linkSplit}
        onClose={() => setLinkSplit(null)}
        onLinked={() => {
          setLinkSplit(null);
          qc.invalidateQueries({ queryKey: ["bank-transactions"] });
          qc.invalidateQueries({ queryKey: ["split-requests"] });
        }}
      />
    </>
  );
}

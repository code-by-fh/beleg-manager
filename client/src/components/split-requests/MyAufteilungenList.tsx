import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link2, ArrowLeftRight } from "lucide-react";
import { useOutgoingRequests } from "@/hooks/useSplitRequests";
import { useToast } from "@/components/ui/use-toast";
import { useDeleteRequest } from "@/hooks/useSplitRequests";
import { bankApi } from "@/api/bank";
import { SplitBankTxDialog } from "@/components/bank/SplitBankTxDialog";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import { Trash2 } from "lucide-react";
import type { OutgoingRequest } from "@/api/splitRequests";

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Ausstehend",    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  accepted:  { label: "Angenommen",   cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  rejected:  { label: "Abgelehnt",    cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  cancelled: { label: "Zurückgezogen", cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
  settled:   { label: "Ausgeglichen", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
};

function getStatusKey(r: OutgoingRequest): string {
  return r.linkedBankTxId ? "settled" : r.status;
}

export function MyAufteilungenList() {
  const { data, isLoading } = useOutgoingRequests();
  const { data: bankData } = useQuery({ queryKey: ["bank-transactions"], queryFn: () => bankApi.listTransactions() });
  const qc = useQueryClient();
  const { toast } = useToast();
  const deleteRequest = useDeleteRequest();
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
                  const sk = getStatusKey(r);
                  const { label, cls } = STATUS_CONFIG[sk] ?? STATUS_CONFIG["pending"]!;
                  const linkedTx = r.linkedBankTxId ? txMap.get(r.linkedBankTxId) : undefined;
                  const personName = r.toUser?.name ?? r.freeName ?? "—";
                  return (
                    <div key={r.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{personName}</span>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${cls}`}>
                            {label}
                          </span>
                        </div>
                        {linkedTx && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            <ArrowLeftRight className="h-3 w-3 inline mr-1" />
                            {linkedTx.haendler} · {formatDateIso(linkedTx.buchungsdatum)} · {formatCurrency(linkedTx.betrag)}
                          </p>
                        )}
                      </div>
                      <span className="font-bold text-sm flex-shrink-0">{formatCurrency(r.betrag, meta.waehrung)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-7 w-7 flex-shrink-0 ${r.linkedBankTxId ? "text-green-600 hover:text-green-700" : "text-muted-foreground"}`}
                        title={r.linkedBankTxId ? "Kontobewegung ändern" : "Kontobewegung zuordnen"}
                        onClick={() => setLinkSplit(r)}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 flex-shrink-0"
                        onClick={() => handleDelete(r.id)}
                        disabled={deleteRequest.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </Button>
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

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { splitsApi } from "@/api/splits";
import { bankApi } from "@/api/bank";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Link2, ArrowLeftRight } from "lucide-react";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import { SplitBankTxDialog } from "@/components/bank/SplitBankTxDialog";
import type { SplitRow, SplitStatus } from "@/types/receipt";

// ── Status config ─────────────────────────────────────────────────────────────

type DisplayStatus = SplitStatus | "ausgeglichen";

const STATUS_CONFIG: Record<DisplayStatus, { label: string; cls: string }> = {
  offen:             { label: "Offen",               cls: "bg-amber-100 text-amber-700" },
  angefordert:       { label: "Angefordert",         cls: "bg-blue-100 text-blue-700" },
  unterwegs:         { label: "Unterwegs",           cls: "bg-purple-100 text-purple-700" },
  ohne_verrechnung:  { label: "Ohne Verrechnung",    cls: "bg-zinc-100 text-zinc-600" },
  ausgeglichen:      { label: "Ausgeglichen",        cls: "bg-green-100 text-green-700" },
};

function getDisplayStatus(s: SplitRow): DisplayStatus {
  if (s.linkedBankTxId) return "ausgeglichen";
  return s.status;
}

function isClosed(s: SplitRow): boolean {
  return !!s.linkedBankTxId || s.status === "ohne_verrechnung";
}

function StatusBadge({ split }: { split: SplitRow }) {
  const ds = getDisplayStatus(split);
  const { label, cls } = STATUS_CONFIG[ds];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      {ds === "ausgeglichen" && <ArrowLeftRight className="h-3 w-3" />}
      {label}
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
  const [busyId, setBusyId] = useState<string | null>(null);

  const splits = data?.splits ?? [];

  const txMap = useMemo(() => {
    const m = new Map<string, { haendler: string; buchungsdatum: string; betrag: number }>();
    for (const tx of bankData?.transactions ?? []) m.set(tx.id, tx);
    return m;
  }, [bankData]);

  // Group splits by receiptId
  const byReceipt = useMemo(() => {
    const map = new Map<string, SplitRow[]>();
    for (const s of splits) {
      const list = map.get(s.receiptId) ?? [];
      list.push(s);
      map.set(s.receiptId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.erstelltAm.localeCompare(b.erstelltAm));
    return map;
  }, [splits]);

  // Active groups: at least one split not closed
  // Closed groups: all splits closed
  const { activeGroups, closedGroups } = useMemo(() => {
    const active: [string, SplitRow[]][] = [];
    const closed: [string, SplitRow[]][] = [];
    for (const entry of byReceipt.entries()) {
      const [id, items] = entry;
      if (items.every(isClosed)) closed.push([id, items]);
      else active.push([id, items]);
    }
    return { activeGroups: active, closedGroups: closed };
  }, [byReceipt]);

  // Summary: only active splits count as "offen"
  const totalOpen = splits.filter((s) => !isClosed(s)).reduce((sum, s) => sum + s.betrag, 0);
  const totalClosed = splits.filter(isClosed).reduce((sum, s) => sum + s.betrag, 0);

  async function handleStatusChange(split: SplitRow, status: SplitStatus) {
    setBusyId(split.splitId);
    try {
      await splitsApi.setStatus(split.splitId, status);
      qc.invalidateQueries({ queryKey: ["splits"] });
    } catch {
      toast({ title: "Fehler beim Aktualisieren", variant: "destructive" });
    } finally {
      setBusyId(null);
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
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Abgeschlossen</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalClosed)}</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {byReceipt.size === 0 && (
        <div className="rounded-xl border border-border bg-muted/20 p-10 text-center text-muted-foreground text-sm">
          Noch keine Aufteilungen. Teile Belege in der Belegliste auf.
        </div>
      )}

      {/* Active groups */}
      {activeGroups.map(([receiptId, items]) => (
        <ReceiptGroup
          key={receiptId}
          items={items}
          txMap={txMap}
          busyId={busyId}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
          onLink={(s) => setLinkSplit(s)}
        />
      ))}

      {/* Closed groups */}
      {closedGroups.length > 0 && (
        <>
          {activeGroups.length > 0 && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex-1 border-t border-border" />
              <span className="font-medium uppercase tracking-wider">Abgeschlossen</span>
              <div className="flex-1 border-t border-border" />
            </div>
          )}
          {closedGroups.map(([receiptId, items]) => (
            <ReceiptGroup
              key={receiptId}
              items={items}
              txMap={txMap}
              busyId={busyId}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onLink={(s) => setLinkSplit(s)}
              closed
            />
          ))}
        </>
      )}

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

// ── Receipt group component ───────────────────────────────────────────────────

type ReceiptGroupProps = {
  items: SplitRow[];
  txMap: Map<string, { haendler: string; buchungsdatum: string; betrag: number }>;
  busyId: string | null;
  onStatusChange: (split: SplitRow, status: SplitStatus) => void;
  onDelete: (id: string) => void;
  onLink: (split: SplitRow) => void;
  closed?: boolean;
};

function ReceiptGroup({ items, txMap, busyId, onStatusChange, onDelete, onLink, closed }: ReceiptGroupProps) {
  const first = items[0]!;
  const openCount = items.filter((s) => !isClosed(s)).length;

  return (
    <div className={`rounded-xl border border-border bg-card overflow-hidden ${closed ? "opacity-70" : ""}`}>
      {/* Receipt header */}
      <div className={`px-5 py-4 flex items-center justify-between border-b border-border ${closed ? "bg-muted/10" : "bg-muted/20"}`}>
        <div>
          <p className="font-semibold">{first.haendler}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatDateIso(first.datum)} · Gesamt {formatCurrency(first.gesamtbetrag, first.waehrung)}
          </p>
        </div>
        <div className="text-right">
          {closed ? (
            <span className="text-xs font-medium text-muted-foreground">Alle abgeschlossen</span>
          ) : (
            <span className="text-xs font-medium text-amber-600">{openCount} offen</span>
          )}
        </div>
      </div>

      {/* Split rows */}
      <div className="divide-y divide-border">
        {items.map((s) => {
          const linkedTx = s.linkedBankTxId ? txMap.get(s.linkedBankTxId) : undefined;
          const ds = getDisplayStatus(s);
          const isAusgeglichen = ds === "ausgeglichen";

          return (
            <div
              key={s.splitId}
              className={`px-5 py-3 flex items-start gap-3 transition-colors ${isClosed(s) ? "opacity-60" : ""}`}
            >
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{s.person}</span>
                  <StatusBadge split={s} />
                </div>
                {linkedTx && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <ArrowLeftRight className="h-3 w-3 inline mr-1" />
                    {linkedTx.haendler} · {formatDateIso(linkedTx.buchungsdatum)} · {formatCurrency(linkedTx.betrag)}
                  </p>
                )}
              </div>

              {/* Amount */}
              <span className="font-bold flex-shrink-0 text-sm pt-0.5">{formatCurrency(s.betrag, s.waehrung)}</span>

              {/* Status selector — hidden when ausgeglichen (derived from bank tx) */}
              {!isAusgeglichen && (
                <div className="flex-shrink-0">
                  <Select
                    value={s.status}
                    onValueChange={(v) => onStatusChange(s, v as SplitStatus)}
                    disabled={busyId === s.splitId}
                  >
                    <SelectTrigger className="h-7 w-36 text-xs px-2 py-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="offen">Offen</SelectItem>
                      <SelectItem value="angefordert">Angefordert</SelectItem>
                      <SelectItem value="unterwegs">Unterwegs</SelectItem>
                      <SelectItem value="ohne_verrechnung">Ohne Verrechnung</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 ${s.linkedBankTxId ? "text-green-600 hover:text-green-700" : "text-muted-foreground hover:text-foreground"}`}
                  title={s.linkedBankTxId ? "Kontobewegung ändern" : "Kontobewegung zuordnen"}
                  onClick={() => onLink(s)}
                >
                  <Link2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onDelete(s.splitId)}
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
}

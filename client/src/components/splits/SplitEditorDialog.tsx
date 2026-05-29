import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Sparkles, Loader2, Minus } from "lucide-react";
import { splitRequestsApi } from "@/api/splitRequests";
import { useKnownPersons } from "@/hooks/useSplitRequests";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import { PersonPicker, type Item } from "./PersonPicker";
import { receiptsApi } from "@/api/receipts";
import type { ReceiptRow } from "@/types/receipt";
import type { BankTransaction } from "@/types/bank";
import type { OutgoingRequest } from "@/api/splitRequests";

export type SplitContext =
  | {
      type: "receipt";
      receipt: ReceiptRow;
      linkedBankTxId: string | null;
      existingSplits: OutgoingRequest[];
    }
  | {
      type: "bankTx";
      transaction: BankTransaction;
      existingSplits: OutgoingRequest[];
    };

interface SplitEditorDialogProps {
  context: SplitContext | null;
  onClose: () => void;
}

function extractDriveFileId(driveLink: string): string | null {
  return driveLink.match(/\/file\/d\/([^/?]+)/)?.[1] ?? null;
}

export function SplitEditorDialog({ context, onClose }: SplitEditorDialogProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: knownPersons = [] } = useKnownPersons();
  const [items, setItems] = useState<Item[]>([
    { toUser: null, freeName: "", betrag: "", searchInput: "", showDropdown: false },
  ]);
  const [busy, setBusy] = useState(false);

  const [positions, setPositions] = useState<Array<{ name: string; amount: number }>>([]);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [positionAssignments, setPositionAssignments] = useState<Record<number, string[]>>({});
  const [activeTab, setActiveTab] = useState<"gesamtbetrag" | "positions">("gesamtbetrag");
  const [splitCount, setSplitCount] = useState(2);

  const contextKey =
    context?.type === "receipt" ? context.receipt.id : context?.transaction.id;

  const totalAmount = useMemo(() => {
    if (!context) return 0;
    return context.type === "receipt"
      ? context.receipt.betrag
      : Math.abs(context.transaction.betrag);
  }, [context]);

  const title = context?.type === "receipt" ? "Beleg aufteilen" : "Kontobewegung aufteilen";

  const description = useMemo(() => {
    if (!context) return "";
    if (context.type === "receipt") {
      const r = context.receipt;
      return `${r.haendler} · ${formatCurrency(r.betrag, r.waehrung)} · ${r.datum}`;
    }
    const tx = context.transaction;
    return `${tx.haendler} · ${formatCurrency(Math.abs(tx.betrag))} · ${formatDateIso(tx.buchungsdatum)}`;
  }, [context]);

  useEffect(() => {
    if (!context) return;
    const existing = context.existingSplits;
    if (existing.length > 0) {
      setItems(
        existing.map((r) => ({
          toUser: r.toUser,
          freeName: r.freeName ?? "",
          betrag: String(r.betrag),
          searchInput: r.toUser?.name ?? r.freeName ?? "",
          showDropdown: false,
        }))
      );
      setSplitCount(existing.length + 1);
    } else {
      setSplitCount(2);
      setItems([{ toUser: null, freeName: "", betrag: (Math.round((totalAmount / 2) * 100) / 100).toFixed(2), searchInput: "", showDropdown: false }]);
    }
    // Reset positions states when context changes
    setPositions([]);
    setPositionAssignments({});
    setActiveTab("gesamtbetrag");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey, totalAmount]);

  const maxSplitCount = positions.length > 0 ? Math.min(10, positions.length) : 10;

  function applySplitCount(n: number) {
    const clamped = Math.max(2, Math.min(maxSplitCount, n));
    setSplitCount(clamped);
    const share = (Math.round((totalAmount / clamped) * 100) / 100).toFixed(2);
    setItems((prev) =>
      Array.from({ length: clamped - 1 }, (_, i) => ({
        toUser: prev[i]?.toUser ?? null,
        freeName: prev[i]?.freeName ?? "",
        searchInput: prev[i]?.searchInput ?? "",
        showDropdown: false,
        betrag: share,
      }))
    );
  }

  // Context-dependent parameters will be derived below, after all hooks.

  function addItem() {
    if (splitCount >= maxSplitCount) return;
    setItems((prev) => [
      ...prev,
      { toUser: null, freeName: "", betrag: "", searchInput: "", showDropdown: false },
    ]);
    setSplitCount((c) => c + 1);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setSplitCount((c) => Math.max(2, c - 1));
    setPositionAssignments((prev) => {
      const next: Record<number, string[]> = {};
      Object.entries(prev).forEach(([pKey, assigned]) => {
        const pIdx = parseInt(pKey, 10);
        const cleaned = assigned
          .map((pId) => {
            if (pId === "owner") return pId;
            const itemIdx = parseInt(pId.replace("item-", ""), 10);
            if (itemIdx === idx) return null;
            if (itemIdx > idx) return `item-${itemIdx - 1}`;
            return pId;
          })
          .filter((x): x is string => x !== null);
        next[pIdx] = cleaned.length === 0 ? ["owner"] : cleaned;
      });
      return next;
    });
  }

  function updateItem(idx: number, updates: Partial<Item>) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...updates } : item)));
  }

  async function loadPositions() {
    if (context?.type !== "receipt") return;
    setLoadingPositions(true);
    try {
      const res = await receiptsApi.extractPositions(context.receipt.id);
      setPositions(res.items || []);
      const initial: Record<number, string[]> = {};
      (res.items || []).forEach((_, idx) => {
        initial[idx] = ["owner"];
      });
      setPositionAssignments(initial);
    } catch (err) {
      toast({
        title: "Fehler beim Auslesen",
        description: "Die Beleg-Positionen konnten nicht ausgelesen werden.",
        variant: "destructive",
      });
    } finally {
      setLoadingPositions(false);
    }
  }

  useEffect(() => {
    if (context?.type === "receipt" && positions.length === 0 && !loadingPositions) {
      loadPositions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey, positions.length]);

  const participants = useMemo(() => {
    return [
      { id: "owner", name: "Ich" },
      ...items.map((item, idx) => ({
        id: `item-${idx}`,
        name: item.toUser ? item.toUser.name : item.freeName || `Person ${idx + 1}`,
      })),
    ];
  }, [items]);

  function toggleAssignment(pIdx: number, pId: string) {
    setPositionAssignments((prev) => {
      const current = prev[pIdx] || ["owner"];
      let next: string[];
      if (current.includes(pId)) {
        next = current.filter((x) => x !== pId);
      } else {
        next = [...current, pId];
      }
      return { ...prev, [pIdx]: next };
    });
  }

  // Recalculate amounts for items
  useEffect(() => {
    if (activeTab !== "positions") return;
    if (positions.length === 0 || context?.type !== "receipt") return;

    const newAmounts = items.map(() => 0);
    positions.forEach((pos, pIdx) => {
      const assigned = positionAssignments[pIdx] || ["owner"];
      if (assigned.length === 0) return;
      const share = pos.amount / assigned.length;
      assigned.forEach((pId) => {
        if (pId !== "owner") {
          const idx = parseInt(pId.replace("item-", ""), 10);
          if (!isNaN(idx) && idx >= 0 && idx < newAmounts.length) {
            const current = newAmounts[idx] ?? 0;
            newAmounts[idx] = current + share;
          }
        }
      });
    });

    setItems((prev) =>
      prev.map((item, idx) => {
        const val = newAmounts[idx] ?? 0;
        const nextVal = val > 0 ? (Math.round(val * 100) / 100).toFixed(2) : "";
        if (item.betrag === nextVal) return item;
        return { ...item, betrag: nextVal };
      })
    );
  }, [positionAssignments, positions, items.length, context?.type, activeTab]);

  async function handleSubmit() {
    const ctx = context;
    if (!ctx) return;
    const valid = items.filter(
      (i) => (i.toUser || i.freeName.trim() || i.searchInput.trim()) && parseFloat(i.betrag) > 0
    );
    if (valid.length === 0) return;

    setBusy(true);
    try {
      if (ctx.existingSplits.length > 0) {
        await Promise.all(ctx.existingSplits.map((r) => splitRequestsApi.delete(r.id)));
      }

      const receiptMeta =
        ctx.type === "receipt"
          ? {
              haendler: ctx.receipt.haendler || "Unbekannt",
              datum: ctx.receipt.datum || new Date().toISOString().slice(0, 10),
              gesamtbetrag: ctx.receipt.betrag || 0,
              waehrung: ctx.receipt.waehrung || "EUR",
            }
          : {
              haendler: ctx.transaction.haendler || "Unbekannt",
              datum: ctx.transaction.buchungsdatum || new Date().toISOString().slice(0, 10),
              gesamtbetrag: Math.abs(ctx.transaction.betrag) || 0,
              waehrung: "EUR",
            };

      const receiptSqliteId =
        ctx.type === "receipt"
          ? ctx.receipt.id
          : (ctx.transaction.matchedReceiptId ?? undefined);

      const driveFileId =
        ctx.type === "receipt" ? extractDriveFileId(ctx.receipt.driveLink) : null;

      const positionsWithAssignments = activeTab === "positions" && positions.length > 0
        ? positions.map((pos, pIdx) => {
            const assignedIds = positionAssignments[pIdx] || ["owner"];
            const assignedNames = assignedIds.map((id) => {
              if (id === "owner") return "Ich";
              const idx = parseInt(id.replace("item-", ""), 10);
              const item = items[idx];
              if (item) {
                return item.toUser ? item.toUser.name : (item.freeName.trim() || item.searchInput.trim() || `Person ${idx + 1}`);
              }
              return `Person ${idx + 1}`;
            });
            return {
              name: pos.name,
              amount: pos.amount,
              assigned: assignedNames,
            };
          })
        : null;

      const created = await Promise.all(
        valid.map((i) =>
          splitRequestsApi.create({
            toUserId: i.toUser?.id,
            freeName: i.toUser ? undefined : (i.freeName.trim() || i.searchInput.trim()),
            receiptId: driveFileId ?? undefined,
            receiptSqliteId,
            receiptMeta,
            betrag: parseFloat(i.betrag),
            nachricht: "",
            positions: positionsWithAssignments,
          })
        )
      );

      const bankTxId =
        ctx.type === "receipt"
          ? null
          : ctx.transaction.betrag > 0 ? ctx.transaction.id : null;

      if (bankTxId) {
        await Promise.all(
          created.map((res) => splitRequestsApi.linkBankTx(res.request.id, bankTxId))
        );
      }

      const hasExisting = ctx.existingSplits.length > 0;
      qc.invalidateQueries({ queryKey: ["split-requests"] });
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      toast({ title: hasExisting ? "Aufteilung aktualisiert" : "Aufteilung gespeichert" });
      onClose();
    } catch {
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (!context) return null;

  const waehrung = context.type === "receipt" ? context.receipt.waehrung : "EUR";
  const totalAssigned = items.reduce((s, i) => s + (parseFloat(i.betrag) || 0), 0);
  const remaining = Math.round((totalAmount - totalAssigned) * 100) / 100;
  const hasExisting = context.existingSplits.length > 0;

  const renderManualSplit = () => (
    <div className="space-y-3 py-2">
      <div className="flex items-center gap-2 pb-1">
        <span className="text-xs text-muted-foreground">Gleich aufteilen in</span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => applySplitCount(splitCount - 1)}
            disabled={splitCount <= 2}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <span className="w-8 text-center text-sm font-semibold tabular-nums">{splitCount}</span>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => applySplitCount(splitCount + 1)}
            disabled={splitCount >= maxSplitCount}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">Teile</span>
      </div>
      {items.map((item, idx) => (
        <div key={idx} className="flex gap-2 items-start animate-in fade-in slide-in-from-top-1 duration-200">
          <PersonPicker
            item={item}
            index={idx}
            knownPersons={knownPersons}
            idPrefix="split-editor"
            onChange={updateItem}
          />
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="Betrag"
            value={item.betrag}
            onChange={(e) => updateItem(idx, { betrag: e.target.value })}
            className="w-28 h-9 flex-shrink-0"
          />
          {items.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeItem(idx)}
              className="h-9 w-9 flex-shrink-0"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      ))}

      <Button
        variant="ghost"
        size="sm"
        onClick={addItem}
        className="gap-1.5 text-muted-foreground animate-in fade-in"
      >
        <Plus className="h-4 w-4" /> Person hinzufügen
      </Button>

      <div
        className={`text-xs font-medium mt-1 transition-all ${
          remaining < -0.01
            ? "text-destructive"
            : remaining > 0.01
            ? "text-muted-foreground"
            : "text-green-600 dark:text-green-400"
        }`}
      >
        {remaining > 0.01
          ? `Noch nicht aufgeteilt: ${formatCurrency(remaining, waehrung)}`
          : remaining < -0.01
          ? `Summe überschreitet Betrag um ${formatCurrency(-remaining, waehrung)}`
          : "Vollständig aufgeteilt ✓"}
      </div>
    </div>
  );

  return (
    <Dialog open={context !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md rounded-2xl border border-border/80 shadow-2xl backdrop-blur-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {context.type === "bankTx" ? (
          renderManualSplit()
        ) : (
          <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4 bg-muted/40 p-1 rounded-xl border border-border/20">
              <TabsTrigger value="gesamtbetrag" className="rounded-lg text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm">Gesamtbetrag</TabsTrigger>
              <TabsTrigger value="positions" className="rounded-lg text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm">Einzelpositionen</TabsTrigger>
            </TabsList>

            <TabsContent value="gesamtbetrag" className="outline-none">
              {renderManualSplit()}
            </TabsContent>

            <TabsContent value="positions" className="space-y-4 py-2 outline-none">
              {loadingPositions ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-3">
                  <Loader2 className="h-8 w-8 text-primary animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground animate-pulse">Beleg-Positionen werden analysiert...</p>
                </div>
              ) : positions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Sparkles className="h-8 w-8 text-amber-500/80 mb-2 animate-bounce" />
                  <p className="text-sm font-medium mb-1">Keine Positionen geladen</p>
                  <p className="text-xs text-muted-foreground max-w-xs mb-4">
                    Der Beleg besitzt keine Positionsdaten.
                  </p>
                  <Button onClick={loadPositions} className="gap-2">
                    <Sparkles className="h-4 w-4" />
                    Beleg analysieren
                  </Button>
                </div>
              ) : (
                <>
                  <div className="max-h-64 overflow-y-auto pr-1 space-y-2.5 rounded-lg border border-border/40 p-2 bg-muted/10">
                    {positions.map((pos, pIdx) => {
                      const assigned = positionAssignments[pIdx] || ["owner"];
                      return (
                        <div key={pIdx} className="flex flex-col gap-1.5 p-2 rounded-md border border-border bg-card hover:border-border/80 transition-colors">
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-sm font-medium text-foreground truncate max-w-[200px]" title={pos.name}>
                              {pos.name}
                            </span>
                            <span className="text-sm font-mono font-semibold text-primary">
                              {formatCurrency(pos.amount, waehrung)}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {participants.map((part) => {
                              const isSelected = assigned.includes(part.id);
                              return (
                                <button
                                  key={part.id}
                                  type="button"
                                  onClick={() => toggleAssignment(pIdx, part.id)}
                                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                                    isSelected
                                      ? "bg-primary text-primary-foreground shadow-sm"
                                      : "bg-muted/40 text-muted-foreground hover:bg-muted/80"
                                  }`}
                                >
                                  {part.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="border-t border-border/60 pt-3 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Beteiligte & berechnete Summen</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={addItem}
                        className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="h-3.5 w-3.5" /> Person hinzufügen
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center h-9 px-3 rounded-md bg-muted/20 border border-border/40 text-sm">
                        <span className="font-semibold text-muted-foreground">Ich (Besitzer)</span>
                        <span className="font-mono font-semibold">
                          {formatCurrency(
                            positions.reduce((acc, pos, pIdx) => {
                              const assigned = positionAssignments[pIdx] || ["owner"];
                              if (assigned.includes("owner")) return acc + pos.amount / assigned.length;
                              return acc;
                            }, 0),
                            waehrung
                          )}
                        </span>
                      </div>

                      {items.map((item, idx) => {
                        const itemAmount = positions.reduce((acc, pos, pIdx) => {
                          const assigned = positionAssignments[pIdx] || ["owner"];
                          if (assigned.includes(`item-${idx}`)) return acc + pos.amount / assigned.length;
                          return acc;
                        }, 0);
                        return (
                          <div key={idx} className="flex gap-2 items-center">
                            <div className="flex-1">
                              <PersonPicker
                                item={item}
                                index={idx}
                                knownPersons={knownPersons}
                                idPrefix="split-editor"
                                onChange={updateItem}
                              />
                            </div>
                            <div className="w-24 h-9 flex items-center justify-end px-3 rounded-md border border-border bg-muted/10 font-mono font-semibold text-sm">
                              {formatCurrency(itemAmount, waehrung)}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeItem(idx)}
                              className="h-9 w-9 flex-shrink-0"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        )}

        <div className="flex gap-2 pt-2 border-t border-border/40">
          <Button variant="ghost" onClick={onClose} className="flex-1" disabled={busy}>
            Abbrechen
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              busy ||
              items.every(
                (i) =>
                  (!i.toUser && !i.freeName.trim() && !i.searchInput.trim()) ||
                  !parseFloat(i.betrag)
              )
            }
            className="flex-1"
          >
            {busy ? "Speichern…" : hasExisting ? "Aufteilung aktualisieren" : "Aufteilung speichern"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

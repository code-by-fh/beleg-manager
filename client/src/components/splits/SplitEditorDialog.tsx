import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { splitRequestsApi } from "@/api/splitRequests";
import { useKnownPersons } from "@/hooks/useSplitRequests";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import { PersonPicker, type Item } from "./PersonPicker";
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
    setItems(
      existing.length > 0
        ? existing.map((r) => ({
            toUser: r.toUser,
            freeName: r.freeName ?? "",
            betrag: String(r.betrag),
            searchInput: r.toUser?.name ?? r.freeName ?? "",
            showDropdown: false,
          }))
        : [{ toUser: null, freeName: "", betrag: "", searchInput: "", showDropdown: false }]
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey]);

  if (!context) return null;

  const waehrung = context.type === "receipt" ? context.receipt.waehrung : "EUR";
  const totalAssigned = items.reduce((s, i) => s + (parseFloat(i.betrag) || 0), 0);
  const remaining = Math.round((totalAmount - totalAssigned) * 100) / 100;
  const hasExisting = context.existingSplits.length > 0;

  function addItem() {
    setItems((prev) => [
      ...prev,
      { toUser: null, freeName: "", betrag: "", searchInput: "", showDropdown: false },
    ]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, updates: Partial<Item>) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...updates } : item)));
  }

  async function handleSubmit() {
    const ctx = context;
    if (!ctx) return;
    const valid = items.filter(
      (i) => (i.toUser || i.freeName.trim() || i.searchInput.trim()) && parseFloat(i.betrag) > 0
    );
    if (valid.length === 0) return;

    setBusy(true);
    try {
      // 1. Delete all existing splits (server allows fromUser to delete without status check)
      if (ctx.existingSplits.length > 0) {
        await Promise.all(ctx.existingSplits.map((r) => splitRequestsApi.delete(r.id)));
      }

      // 2. Derive creation params from context
      const receiptMeta =
        ctx.type === "receipt"
          ? {
              haendler: ctx.receipt.haendler,
              datum: ctx.receipt.datum,
              gesamtbetrag: ctx.receipt.betrag,
              waehrung: ctx.receipt.waehrung,
            }
          : {
              haendler: ctx.transaction.haendler,
              datum: ctx.transaction.buchungsdatum,
              gesamtbetrag: Math.abs(ctx.transaction.betrag),
              waehrung: "EUR",
            };

      const receiptSqliteId =
        ctx.type === "receipt"
          ? ctx.receipt.id
          : (ctx.transaction.matchedReceiptId ?? undefined);

      const driveFileId =
        ctx.type === "receipt" ? extractDriveFileId(ctx.receipt.driveLink) : null;

      // 3. Create new splits
      const created = await Promise.all(
        valid.map((i) =>
          splitRequestsApi.create({
            toUserId: i.toUser?.id,
            freeName: i.toUser ? undefined : (i.freeName.trim() || i.searchInput.trim()),
            receiptId: i.toUser && driveFileId ? driveFileId : undefined,
            receiptSqliteId,
            receiptMeta,
            betrag: parseFloat(i.betrag),
            nachricht: "",
          })
        )
      );

      // 4. Link to bank tx
      const bankTxId =
        ctx.type === "receipt"
          ? (ctx.linkedBankTxId ?? null)
          : ctx.transaction.id;

      if (bankTxId) {
        await Promise.all(
          created.map((res) => splitRequestsApi.linkBankTx(res.request.id, bankTxId))
        );
      }

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

  return (
    <Dialog open={context !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {items.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-start">
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
            className="gap-1.5 text-muted-foreground"
          >
            <Plus className="h-4 w-4" /> Person hinzufügen
          </Button>

          <div
            className={`text-xs font-medium mt-1 ${
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

        <div className="flex gap-2 pt-2">
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

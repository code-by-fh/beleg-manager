import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { splitsApi } from "@/api/splits";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/formatters";
import type { ReceiptRow, SplitRow } from "@/types/receipt";

interface SplitDialogProps {
  receipt: ReceiptRow | null;
  allSplits: SplitRow[];
  knownPersons: string[];
  onClose: () => void;
}

type Item = { splitId?: string; person: string; betrag: string };

export function SplitDialog({ receipt, allSplits, knownPersons, onClose }: SplitDialogProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [items, setItems] = useState<Item[]>([{ person: "", betrag: "" }]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!receipt) return;
    const existing = allSplits.filter((s) => s.receiptId === receipt.id);
    setItems(
      existing.length > 0
        ? existing.map((s) => ({ splitId: s.splitId, person: s.person, betrag: String(s.betrag) }))
        : [{ person: "", betrag: "" }]
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt?.id]);

  if (!receipt) return null;

  const existingSplits = allSplits.filter((s) => s.receiptId === receipt.id);
  const totalAssigned = items.reduce((s, i) => s + (parseFloat(i.betrag) || 0), 0);
  const remaining = Math.round((receipt.betrag - totalAssigned) * 100) / 100;

  function addItem() {
    setItems((prev) => [...prev, { person: "", betrag: "" }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: keyof Omit<Item, "splitId">, value: string) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  }

  async function handleSubmit() {
    if (!receipt) return;
    const valid = items.filter((i) => i.person.trim() && parseFloat(i.betrag) > 0);
    if (valid.length === 0) return;

    setBusy(true);
    try {
      if (existingSplits.length > 0) {
        await Promise.all(existingSplits.map((s) => splitsApi.delete(s.splitId)));
      }
      await splitsApi.create({
        receiptId: receipt.id,
        haendler: receipt.haendler,
        datum: receipt.datum,
        gesamtbetrag: receipt.betrag,
        waehrung: receipt.waehrung,
        items: valid.map((i) => ({ person: i.person.trim(), betrag: parseFloat(i.betrag) })),
      });
      qc.invalidateQueries({ queryKey: ["splits"] });
      toast({ title: "Aufteilung gespeichert" });
      onClose();
    } catch {
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const listId = "split-person-suggestions";

  return (
    <Dialog open={receipt !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Beleg aufteilen</DialogTitle>
          <DialogDescription>
            {receipt.haendler} · {formatCurrency(receipt.betrag, receipt.waehrung)} · {receipt.datum}
          </DialogDescription>
        </DialogHeader>

        {knownPersons.length > 0 && (
          <datalist id={listId}>
            {knownPersons.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        )}

        <div className="space-y-3 py-2">
          {items.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <Input
                list={knownPersons.length > 0 ? listId : undefined}
                placeholder="Name"
                value={item.person}
                onChange={(e) => updateItem(idx, "person", e.target.value)}
                className="flex-1 h-9"
              />
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="Betrag"
                value={item.betrag}
                onChange={(e) => updateItem(idx, "betrag", e.target.value)}
                className="w-28 h-9"
              />
              {items.length > 1 && (
                <Button variant="ghost" size="icon" onClick={() => removeItem(idx)} className="h-9 w-9 flex-shrink-0">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}

          <Button variant="ghost" size="sm" onClick={addItem} className="gap-1.5 text-muted-foreground">
            <Plus className="h-4 w-4" /> Person hinzufügen
          </Button>

          <div className={`text-xs font-medium mt-1 ${remaining < -0.01 ? "text-destructive" : remaining > 0.01 ? "text-muted-foreground" : "text-green-600 dark:text-green-400"}`}>
            {remaining > 0.01
              ? `Noch nicht aufgeteilt: ${formatCurrency(remaining, receipt.waehrung)}`
              : remaining < -0.01
              ? `Summe überschreitet Betrag um ${formatCurrency(-remaining, receipt.waehrung)}`
              : "Vollständig aufgeteilt ✓"}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} className="flex-1" disabled={busy}>Abbrechen</Button>
          <Button
            onClick={handleSubmit}
            disabled={busy || items.every((i) => !i.person.trim() || !parseFloat(i.betrag))}
            className="flex-1"
          >
            {busy ? "Speichern…" : existingSplits.length > 0 ? "Aufteilung aktualisieren" : "Aufteilung speichern"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

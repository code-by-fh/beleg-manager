import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, X, User } from "lucide-react";
import { splitRequestsApi } from "@/api/splitRequests";
import { useUserSearch } from "@/hooks/useUserSearch";
import { useKnownPersons } from "@/hooks/useSplitRequests";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/formatters";
import type { ReceiptRow } from "@/types/receipt";
import type { OutgoingRequest, UserInfo } from "@/api/splitRequests";

interface SplitDialogProps {
  receipt: ReceiptRow | null;
  existingRequests: OutgoingRequest[];
  onClose: () => void;
}

type Item = {
  id?: string;
  toUser: UserInfo | null;
  freeName: string;
  betrag: string;
  searchInput: string;
  showDropdown: boolean;
};

function extractDriveFileId(driveLink: string): string | null {
  return driveLink.match(/\/file\/d\/([^/?]+)/)?.[1] ?? null;
}

function PersonPicker({
  item,
  index,
  knownPersons,
  onChange,
}: {
  item: Item;
  index: number;
  knownPersons: string[];
  onChange: (idx: number, updates: Partial<Item>) => void;
}) {
  const { users, setInputValue } = useUserSearch();

  function handleInput(val: string) {
    onChange(index, { searchInput: val, showDropdown: true });
    setInputValue(val);
    if (!val) onChange(index, { toUser: null, freeName: "" });
  }

  function selectUser(u: UserInfo) {
    onChange(index, { toUser: u, freeName: "", searchInput: u.name, showDropdown: false });
    setInputValue("");
  }

  function selectFreeName(name: string) {
    onChange(index, { toUser: null, freeName: name, searchInput: name, showDropdown: false });
    setInputValue("");
  }

  function clearSelection() {
    onChange(index, { toUser: null, freeName: "", searchInput: "", showDropdown: false });
    setInputValue("");
  }

  const hasSelection = item.toUser !== null || item.freeName.length > 0;
  const showList = item.showDropdown && item.searchInput.length >= 1;
  const listId = `known-persons-${index}`;

  return (
    <div className="relative flex-1">
      {hasSelection ? (
        <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-muted/30 text-sm">
          {item.toUser ? (
            <User className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          ) : null}
          <span className="flex-1 truncate font-medium">
            {item.toUser ? item.toUser.name : item.freeName}
          </span>
          {item.toUser && (
            <span className="text-xs text-muted-foreground truncate max-w-[80px]">{item.toUser.email}</span>
          )}
          <button onClick={clearSelection} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <>
          {knownPersons.length > 0 && (
            <datalist id={listId}>
              {knownPersons.map((p) => <option key={p} value={p} />)}
            </datalist>
          )}
          <Input
            list={knownPersons.length > 0 ? listId : undefined}
            placeholder="Name oder E-Mail"
            value={item.searchInput}
            onChange={(e) => handleInput(e.target.value)}
            onFocus={() => onChange(index, { showDropdown: true })}
            onBlur={() => setTimeout(() => onChange(index, { showDropdown: false }), 150)}
            className="h-9"
          />
          {showList && (
            <div className="absolute top-10 left-0 z-50 w-full rounded-lg border border-border bg-card shadow-lg max-h-44 overflow-y-auto">
              {users.map((u) => (
                <button
                  key={u.id}
                  className="w-full flex flex-col items-start px-3 py-2 text-left hover:bg-muted/50 transition-colors text-sm"
                  onMouseDown={() => selectUser(u)}
                >
                  <span className="font-medium">{u.name}</span>
                  <span className="text-xs text-muted-foreground">{u.email}</span>
                </button>
              ))}
              {item.searchInput.length >= 1 && (
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors text-sm border-t border-border/60"
                  onMouseDown={() => selectFreeName(item.searchInput)}
                >
                  <span className="text-muted-foreground">Als freien Namen:</span>
                  <span className="font-medium">„{item.searchInput}"</span>
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function SplitDialog({ receipt, existingRequests, onClose }: SplitDialogProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: knownPersons = [] } = useKnownPersons();
  const [items, setItems] = useState<Item[]>([{ toUser: null, freeName: "", betrag: "", searchInput: "", showDropdown: false }]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!receipt) return;
    const existing = existingRequests.filter((r) => r.receiptSqliteId === receipt.id);
    setItems(
      existing.length > 0
        ? existing.map((r) => ({
            id: r.id,
            toUser: r.toUser,
            freeName: r.freeName ?? "",
            betrag: String(r.betrag),
            searchInput: r.toUser?.name ?? r.freeName ?? "",
            showDropdown: false,
          }))
        : [{ toUser: null, freeName: "", betrag: "", searchInput: "", showDropdown: false }]
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt?.id]);

  if (!receipt) return null;

  const totalAssigned = items.reduce((s, i) => s + (parseFloat(i.betrag) || 0), 0);
  const remaining = Math.round((receipt.betrag - totalAssigned) * 100) / 100;

  function addItem() {
    setItems((prev) => [...prev, { toUser: null, freeName: "", betrag: "", searchInput: "", showDropdown: false }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, updates: Partial<Item>) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...updates } : item)));
  }

  async function handleSubmit() {
    if (!receipt) return;
    const valid = items.filter((i) => (i.toUser || i.freeName.trim()) && parseFloat(i.betrag) > 0);
    if (valid.length === 0) return;

    setBusy(true);
    try {
      const existing = existingRequests.filter((r) => r.receiptSqliteId === receipt.id);
      if (existing.length > 0) {
        await Promise.all(existing.map((r) => splitRequestsApi.delete(r.id)));
      }

      const driveFileId = extractDriveFileId(receipt.driveLink);

      await Promise.all(
        valid.map((i) =>
          splitRequestsApi.create({
            toUserId: i.toUser?.id,
            freeName: i.toUser ? undefined : i.freeName.trim(),
            receiptId: i.toUser && driveFileId ? driveFileId : undefined,
            receiptSqliteId: receipt.id,
            receiptMeta: {
              haendler: receipt.haendler,
              datum: receipt.datum,
              gesamtbetrag: receipt.betrag,
              waehrung: receipt.waehrung,
            },
            betrag: parseFloat(i.betrag),
            nachricht: "",
          })
        )
      );

      qc.invalidateQueries({ queryKey: ["split-requests"] });
      toast({ title: "Aufteilung gespeichert" });
      onClose();
    } catch {
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const existingForReceipt = existingRequests.filter((r) => r.receiptSqliteId === receipt.id);

  return (
    <Dialog open={receipt !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Beleg aufteilen</DialogTitle>
          <DialogDescription>
            {receipt.haendler} · {formatCurrency(receipt.betrag, receipt.waehrung)} · {receipt.datum}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {items.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <PersonPicker item={item} index={idx} knownPersons={knownPersons} onChange={updateItem} />
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
            disabled={busy || items.every((i) => (!i.toUser && !i.freeName.trim()) || !parseFloat(i.betrag))}
            className="flex-1"
          >
            {busy ? "Speichern…" : existingForReceipt.length > 0 ? "Aufteilung aktualisieren" : "Aufteilung speichern"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

# Split-System: Bugfixes + Shared Component — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5 Logikfehler im Split-System beheben und SplitDialog + BankTxSplitDialog zu einer gemeinsamen `SplitEditorDialog`-Komponente zusammenführen.

**Architecture:** Server-Fixes in zwei Dateien (`bank/routes.ts`, `split-requests/routes.ts`); neue Client-Komponenten unter `client/src/components/splits/`; alte Dialoge werden gelöscht; Aufrufer in `ReceiptTable` und `Kontoabgleich` auf neue Komponente umgestellt.

**Tech Stack:** TypeScript, Express, React, TanStack Query, better-sqlite3, Radix UI / shadcn

---

## Dateiübersicht

```
GEÄNDERT (Server):
  server/src/split-requests/routes.ts   Bug 1 + Bug 2b
  server/src/bank/routes.ts             Bug 2a + Bug 3

GEÄNDERT (Client):
  client/src/components/bank/KontobewegungZuordnenDialog.tsx   Bug 4

NEU (Client):
  client/src/components/splits/PersonPicker.tsx
  client/src/components/splits/SplitEditorDialog.tsx

GEÄNDERT (Aufrufer):
  client/src/components/receipts/ReceiptTable.tsx
  client/src/pages/Kontoabgleich.tsx

GELÖSCHT:
  client/src/components/receipts/SplitDialog.tsx
  client/src/components/bank/BankTxSplitDialog.tsx
```

---

## Task 1: Bug 1 + Bug 2b — `server/src/split-requests/routes.ts`

**Files:**
- Modify: `server/src/split-requests/routes.ts:229-265`

**Bug 1:** Der `DELETE /:id`-Handler verweigert das Löschen von pending-Splits für registrierte Nutzer. Ersteller sollen ihre eigenen Splits ohne Statusprüfung löschen können.

**Bug 2b:** Wenn eine Bank-TX-Verknüpfung aufgehoben wird (`PATCH /:id/bank-tx` mit `bankTxId = null`), muss der Split-Status von `'accepted'` zurück auf `'pending'` gesetzt werden.

- [ ] **Schritt 1: Bug 1 — DELETE-Restriction entfernen**

Datei öffnen: `server/src/split-requests/routes.ts`

Den `DELETE /:id`-Handler (ab Zeile ~251) von:
```typescript
router.delete("/:id", (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const splitReq = splitRequestRepo.getById(req.params.id!);
    if (!splitReq) return res.status(404).json({ error: "not found" });
    if (splitReq.fromUserId !== userId) return res.status(403).json({ error: "forbidden" });
    const isFreeName = splitReq.toUserId === null;
    if (!isFreeName && !["cancelled", "rejected"].includes(splitReq.status)) {
      return res.status(409).json({ error: "can only delete cancelled or rejected requests" });
    }
    splitRequestRepo.delete(req.params.id!);
    db.prepare("DELETE FROM split_bank_links WHERE split_id = ? AND user_id = ?").run(req.params.id, userId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
```

Zu:
```typescript
router.delete("/:id", (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const splitReq = splitRequestRepo.getById(req.params.id!);
    if (!splitReq) return res.status(404).json({ error: "not found" });
    if (splitReq.fromUserId !== userId) return res.status(403).json({ error: "forbidden" });
    splitRequestRepo.delete(req.params.id!);
    db.prepare("DELETE FROM split_bank_links WHERE split_id = ? AND user_id = ?").run(req.params.id, userId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
```

- [ ] **Schritt 2: Bug 2b — Status-Reset beim Unlink**

Den `PATCH /:id/bank-tx`-Handler (ab Zeile ~229) von:
```typescript
const { bankTxId } = parsed.data;
if (bankTxId === null) {
  db.prepare("DELETE FROM split_bank_links WHERE split_id = ? AND user_id = ?").run(req.params.id, userId);
} else {
  db.prepare(
    "INSERT OR REPLACE INTO split_bank_links (split_id, user_id, bank_tx_id, created_at) VALUES (?, ?, ?, ?)"
  ).run(req.params.id, userId, bankTxId, Date.now());
}
```

Zu:
```typescript
const { bankTxId } = parsed.data;
if (bankTxId === null) {
  db.prepare("DELETE FROM split_bank_links WHERE split_id = ? AND user_id = ?").run(req.params.id, userId);
  db.prepare(
    "UPDATE split_requests SET status = 'pending', updated_at = ? WHERE id = ? AND status = 'accepted'"
  ).run(Date.now(), req.params.id);
} else {
  db.prepare(
    "INSERT OR REPLACE INTO split_bank_links (split_id, user_id, bank_tx_id, created_at) VALUES (?, ?, ?, ?)"
  ).run(req.params.id, userId, bankTxId, Date.now());
}
```

- [ ] **Schritt 3: TypeScript-Kompilierung prüfen**

```bash
cd server && npx tsc --noEmit
```

Erwartung: keine Fehler

- [ ] **Schritt 4: Commit**

```bash
git add server/src/split-requests/routes.ts
git commit -m "fix(splits): allow owner to delete pending splits; reset status on tx unlink"
```

---

## Task 2: Bug 2a + Bug 3 — `server/src/bank/routes.ts`

**Files:**
- Modify: `server/src/bank/routes.ts:98-124` (autoMatchSplitsForUser)
- Modify: `server/src/bank/routes.ts:229-259` (POST /match)

**Bug 2a:** `autoMatchSplitsForUser` setzt nur einen `split_bank_links`-Eintrag, aktualisiert aber nicht `split_requests.status`. Nach dem Match muss Status auf `'accepted'` gesetzt werden.

**Bug 3:** `POST /api/bank/match` prüft nicht ob die `receiptId` bereits einer anderen Transaktion desselben Users zugeordnet ist.

- [ ] **Schritt 1: Bug 2a — Status in autoMatchSplitsForUser setzen**

In `autoMatchSplitsForUser`, den `if (matchingTx)`-Block (ab Zeile ~116) von:
```typescript
if (matchingTx) {
  insertLink.run(split.id, userId, matchingTx.id, now);
  usedTxIds.add(matchingTx.id);
  matched++;
}
```

Zu:
```typescript
if (matchingTx) {
  insertLink.run(split.id, userId, matchingTx.id, now);
  deps.db
    .prepare("UPDATE split_requests SET status = 'accepted', updated_at = ? WHERE id = ?")
    .run(now, split.id);
  usedTxIds.add(matchingTx.id);
  matched++;
}
```

- [ ] **Schritt 2: Bug 3 — 1:1-Check in POST /match**

Den `POST /match`-Handler — nach dem `receiptRepo.findById`-Check (Zeile ~242) von:
```typescript
if (receiptId !== null) {
  const exists = receiptRepo.findById(userId, receiptId);
  if (!exists) {
    return res.status(404).json({ error: `Receipt ${receiptId} not found` });
  }
}

txRepo.updateMatch(transactionId, userId, receiptId, "manual");
```

Zu:
```typescript
if (receiptId !== null) {
  const exists = receiptRepo.findById(userId, receiptId);
  if (!exists) {
    return res.status(404).json({ error: `Receipt ${receiptId} not found` });
  }
  const conflict = deps.db
    .prepare(
      "SELECT id FROM bank_transactions WHERE user_id = ? AND matched_receipt_id = ? AND id != ?"
    )
    .get(userId, receiptId, transactionId) as { id: string } | undefined;
  if (conflict) {
    return res.status(409).json({
      error: "Dieser Beleg ist bereits einer anderen Kontobewegung zugeordnet.",
    });
  }
}

txRepo.updateMatch(transactionId, userId, receiptId, "manual");
```

- [ ] **Schritt 3: TypeScript-Kompilierung prüfen**

```bash
cd server && npx tsc --noEmit
```

Erwartung: keine Fehler

- [ ] **Schritt 4: Commit**

```bash
git add server/src/bank/routes.ts
git commit -m "fix(bank): set split status on auto-match; enforce 1:1 receipt-tx constraint"
```

---

## Task 3: Bug 4 — `client/src/components/bank/KontobewegungZuordnenDialog.tsx`

**Files:**
- Modify: `client/src/components/bank/KontobewegungZuordnenDialog.tsx:41-52`

Positive Kontobewegungen (Geldeingänge) dürfen nicht als Kandidaten für die Beleg-Zuordnung erscheinen. Ein Beleg ist eine Ausgabe und gehört zu einer negativen Transaktion.

- [ ] **Schritt 1: Vorzeichenfilter hinzufügen**

Den `candidates`-useMemo (Zeile ~41) von:
```typescript
const candidates = useMemo(() => {
  const txs = (data?.transactions ?? []).filter(
    (tx) => tx.matchStatus === "unmatched" || tx.matchedReceiptId === receipt?.id
  );
  if (!search.trim()) return txs;
  const q = search.toLowerCase();
  return txs.filter(
    (tx) =>
      tx.haendler.toLowerCase().includes(q) ||
      tx.verwendungszweck.toLowerCase().includes(q)
  );
}, [data, search, receipt?.id]);
```

Zu:
```typescript
const candidates = useMemo(() => {
  const txs = (data?.transactions ?? []).filter(
    (tx) =>
      tx.betrag < 0 &&
      (tx.matchStatus === "unmatched" || tx.matchedReceiptId === receipt?.id)
  );
  if (!search.trim()) return txs;
  const q = search.toLowerCase();
  return txs.filter(
    (tx) =>
      tx.haendler.toLowerCase().includes(q) ||
      tx.verwendungszweck.toLowerCase().includes(q)
  );
}, [data, search, receipt?.id]);
```

- [ ] **Schritt 2: TypeScript-Kompilierung prüfen**

```bash
cd client && npx tsc --noEmit
```

Erwartung: keine Fehler

- [ ] **Schritt 3: Commit**

```bash
git add client/src/components/bank/KontobewegungZuordnenDialog.tsx
git commit -m "fix(bank): exclude positive transactions from receipt assignment candidates"
```

---

## Task 4: PersonPicker-Komponente extrahieren

**Files:**
- Create: `client/src/components/splits/PersonPicker.tsx`

Identische `PersonPicker`-Implementierung aus `SplitDialog.tsx` und `BankTxSplitDialog.tsx` wird in eine eigenständige Datei extrahiert. Der `idPrefix`-Prop stellt sicher dass `datalist`-IDs global eindeutig bleiben.

- [ ] **Schritt 1: Datei anlegen**

Neue Datei `client/src/components/splits/PersonPicker.tsx`:

```typescript
import { X, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useUserSearch } from "@/hooks/useUserSearch";
import type { UserInfo } from "@/api/splitRequests";

export type Item = {
  toUser: UserInfo | null;
  freeName: string;
  betrag: string;
  searchInput: string;
  showDropdown: boolean;
};

interface PersonPickerProps {
  item: Item;
  index: number;
  knownPersons: string[];
  idPrefix: string;
  onChange: (idx: number, updates: Partial<Item>) => void;
}

export function PersonPicker({ item, index, knownPersons, idPrefix, onChange }: PersonPickerProps) {
  const { users, setInputValue } = useUserSearch();

  function handleInput(val: string) {
    onChange(index, { searchInput: val, showDropdown: !!val, toUser: null });
    setInputValue(val);
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
  const listId = `${idPrefix}-known-${index}`;

  return (
    <div className="relative flex-1">
      {hasSelection ? (
        <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-muted/30 text-sm">
          {item.toUser && <User className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
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
            onBlur={() =>
              setTimeout(() => {
                onChange(index, {
                  showDropdown: false,
                  ...(item.searchInput.trim() && !item.toUser
                    ? { freeName: item.searchInput.trim() }
                    : {}),
                });
              }, 150)
            }
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
```

- [ ] **Schritt 2: TypeScript-Kompilierung prüfen**

```bash
cd client && npx tsc --noEmit
```

Erwartung: keine Fehler (neue Datei wird noch nicht importiert — kein Fehler erwartet)

- [ ] **Schritt 3: Commit**

```bash
git add client/src/components/splits/PersonPicker.tsx
git commit -m "feat(splits): extract PersonPicker into shared component"
```

---

## Task 5: SplitEditorDialog — gemeinsame Komponente

**Files:**
- Create: `client/src/components/splits/SplitEditorDialog.tsx`

Zentrale Logik beider Dialoge in einer Komponente. Der `SplitContext`-Union-Typ steuert alle kontextabhängigen Werte intern. `receiptSqliteId` wird automatisch aus dem Kontext abgeleitet (Bug 5 Fix).

- [ ] **Schritt 1: Datei anlegen**

Neue Datei `client/src/components/splits/SplitEditorDialog.tsx`:

```typescript
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
    const valid = items.filter(
      (i) => (i.toUser || i.freeName.trim() || i.searchInput.trim()) && parseFloat(i.betrag) > 0
    );
    if (valid.length === 0) return;

    setBusy(true);
    try {
      // 1. Delete all existing splits (server allows fromUser to delete without status check)
      if (context.existingSplits.length > 0) {
        await Promise.all(context.existingSplits.map((r) => splitRequestsApi.delete(r.id)));
      }

      // 2. Derive creation params from context
      const receiptMeta =
        context.type === "receipt"
          ? {
              haendler: context.receipt.haendler,
              datum: context.receipt.datum,
              gesamtbetrag: context.receipt.betrag,
              waehrung: context.receipt.waehrung,
            }
          : {
              haendler: context.transaction.haendler,
              datum: context.transaction.buchungsdatum,
              gesamtbetrag: Math.abs(context.transaction.betrag),
              waehrung: "EUR",
            };

      const receiptSqliteId =
        context.type === "receipt"
          ? context.receipt.id
          : (context.transaction.matchedReceiptId ?? undefined);

      const driveFileId =
        context.type === "receipt" ? extractDriveFileId(context.receipt.driveLink) : null;

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
        context.type === "receipt"
          ? (context.linkedBankTxId ?? null)
          : context.transaction.id;

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
```

- [ ] **Schritt 2: TypeScript-Kompilierung prüfen**

```bash
cd client && npx tsc --noEmit
```

Erwartung: keine Fehler

- [ ] **Schritt 3: Commit**

```bash
git add client/src/components/splits/SplitEditorDialog.tsx
git commit -m "feat(splits): add unified SplitEditorDialog replacing SplitDialog + BankTxSplitDialog"
```

---

## Task 6: ReceiptTable auf SplitEditorDialog umstellen + SplitDialog löschen

**Files:**
- Modify: `client/src/components/receipts/ReceiptTable.tsx`
- Delete: `client/src/components/receipts/SplitDialog.tsx`

- [ ] **Schritt 1: Import austauschen**

In `ReceiptTable.tsx` den Import von `SplitDialog` ersetzen:
```typescript
// Entfernen:
import { SplitDialog } from "./SplitDialog";

// Hinzufügen:
import { SplitEditorDialog, type SplitContext } from "@/components/splits/SplitEditorDialog";
```

- [ ] **Schritt 2: splitContext-Memo hinzufügen**

Nach den bestehenden `useMemo`-Hooks (nach `txSplitMap`, vor dem `toast`-Hook) einfügen:

```typescript
const splitContext = useMemo((): SplitContext | null => {
  if (!splitRow) return null;
  const { direct, bankTx } = getSplitsForReceipt(splitRow.id);
  return {
    type: "receipt",
    receipt: splitRow,
    linkedBankTxId: matchedReceiptTxMap.get(splitRow.id) ?? null,
    existingSplits: [...direct, ...bankTx],
  };
}, [splitRow, outgoingRequests, matchedReceiptTxMap, txSplitMap]);
```

- [ ] **Schritt 3: Dialog-Aufrufe anpassen**

Den `<SplitDialog ...>`-Block am Ende der Komponente (Zeile ~566) ersetzen:

```typescript
// Entfernen:
<SplitDialog
  receipt={splitRow}
  existingRequests={outgoingRequests}
  bankTxSplits={splitRow ? getSplitsForReceipt(splitRow.id).bankTx : []}
  linkedBankTxId={splitRow ? (matchedReceiptTxMap.get(splitRow.id) ?? null) : null}
  onClose={() => setSplitRow(null)}
/>

// Einfügen:
<SplitEditorDialog
  context={splitContext}
  onClose={() => setSplitRow(null)}
/>
```

- [ ] **Schritt 4: Ungenutzte Imports bereinigen**

In `ReceiptTable.tsx` den `type OutgoingRequest`-Import prüfen — er wird noch für `txSplitMap` und `getSplitsForReceipt` benötigt und bleibt erhalten.

- [ ] **Schritt 5: SplitDialog.tsx löschen**

```bash
rm client/src/components/receipts/SplitDialog.tsx
```

- [ ] **Schritt 6: TypeScript-Kompilierung prüfen**

```bash
cd client && npx tsc --noEmit
```

Erwartung: keine Fehler

- [ ] **Schritt 7: Commit**

```bash
git add client/src/components/receipts/ReceiptTable.tsx
git rm client/src/components/receipts/SplitDialog.tsx
git commit -m "refactor(receipts): replace SplitDialog with SplitEditorDialog"
```

---

## Task 7: Kontoabgleich auf SplitEditorDialog umstellen + BankTxSplitDialog löschen

**Files:**
- Modify: `client/src/pages/Kontoabgleich.tsx`
- Delete: `client/src/components/bank/BankTxSplitDialog.tsx`

- [ ] **Schritt 1: Import austauschen**

In `Kontoabgleich.tsx` den Import von `BankTxSplitDialog` ersetzen:
```typescript
// Entfernen:
import { BankTxSplitDialog } from "@/components/bank/BankTxSplitDialog";

// Hinzufügen:
import { SplitEditorDialog, type SplitContext } from "@/components/splits/SplitEditorDialog";
```

- [ ] **Schritt 2: splitContext-Memo hinzufügen**

Nach den bestehenden `useMemo`-Hooks (nach `splitsByTxId`) einfügen:

```typescript
const splitTxContext = useMemo((): SplitContext | null => {
  if (!splitTx) return null;
  return {
    type: "bankTx",
    transaction: splitTx,
    existingSplits: splitsByTxId.get(splitTx.id) ?? [],
  };
}, [splitTx, splitsByTxId]);
```

- [ ] **Schritt 3: Dialog-Aufruf anpassen**

Den `<BankTxSplitDialog ...>`-Block (Zeile ~976) ersetzen:

```typescript
// Entfernen:
<BankTxSplitDialog
  transaction={splitTx}
  existingSplits={splitTx ? (splitsByTxId.get(splitTx.id) ?? []) : []}
  onClose={() => setSplitTx(null)}
/>

// Einfügen:
<SplitEditorDialog
  context={splitTxContext}
  onClose={() => setSplitTx(null)}
/>
```

- [ ] **Schritt 4: BankTxSplitDialog.tsx löschen**

```bash
rm client/src/components/bank/BankTxSplitDialog.tsx
```

- [ ] **Schritt 5: TypeScript-Kompilierung prüfen**

```bash
cd client && npx tsc --noEmit
```

Erwartung: keine Fehler — dies ist die finale Verifikation dass keine weiteren Importreferenzen auf die gelöschten Dateien existieren.

- [ ] **Schritt 6: Commit**

```bash
git add client/src/pages/Kontoabgleich.tsx
git rm client/src/components/bank/BankTxSplitDialog.tsx
git commit -m "refactor(bank): replace BankTxSplitDialog with SplitEditorDialog"
```

---

## Manuelle Verifikation nach Abschluss

Nach allen Tasks die folgenden Szenarien im Browser prüfen:

1. **Bug 1:** Beleg mit registriertem User aufteilen → speichern → erneut öffnen und Betrag ändern → "Aufteilung aktualisieren" muss ohne Fehler funktionieren

2. **Bug 2:** CSV importieren → prüfen ob ein auto-gematchter Split in "Meine Aufteilungen" als "Angenommen" statt "Ausstehend" erscheint; Verknüpfung manuell aufheben → Status muss auf "Ausstehend" zurückspringen

3. **Bug 3:** Beleg manuell zwei verschiedenen Kontobewegungen zuordnen → zweiter Versuch muss einen Fehlertoast zeigen

4. **Bug 4:** In Belegliste auf Link-Icon klicken → Dialog darf nur negative Transaktionen zeigen

5. **Bug 5:** Kontobewegung im Kontoabgleich die einem Beleg zugeordnet ist aufteilen → Split speichern → in Belegliste für diesen Beleg das Split-Icon prüfen — Split muss erscheinen ohne dass die Kontobewegung nochmal manuell zugeordnet werden muss

6. **Shared Component:** Beide Einstiegspunkte (Belegliste + Kontoabgleich) benutzen identisches UI

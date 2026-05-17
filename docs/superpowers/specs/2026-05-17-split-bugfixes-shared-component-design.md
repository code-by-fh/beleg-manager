# Split-System: Bugfixes + Shared Component

**Datum:** 2026-05-17  
**Status:** Approved  
**Scope:** 5 Bugfixes + Zusammenführung SplitDialog/BankTxSplitDialog

---

## Kontext

Das Split-System kennt zwei Einstiegspunkte:

1. **Beleg-Oberfläche** (`ReceiptTable` → `SplitDialog`) — erstellt Splits mit `receiptSqliteId`
2. **Kontoabgleich-Oberfläche** (`Kontoabgleich` → `BankTxSplitDialog`) — erstellt Splits ohne `receiptSqliteId`, verknüpft per `split_bank_links`

Beide Dialoge sind nahezu identisch (gleicher `PersonPicker`, gleicher `Item`-Typ, gleiche Submit-Logik). Gleichzeitig weisen beide und ihre Backends 5 Logikfehler auf.

---

## Bugs und Entscheidungen

### Bug 1 — Pending known-user Splits nicht editierbar

**Problem:** `DELETE /api/split-requests/:id` erlaubt nur Löschen bei Status `cancelled` oder `rejected`. `SplitDialog` löscht Splits vor dem Neu-Erstellen — schlägt für pending Splits mit registrierten Nutzern mit 409 fehl.

**Fix:** Die Statusprüfung im Server wird für `fromUserId` vollständig entfernt. Der Ersteller eines Splits ist dessen Eigentümer und kann ihn jederzeit löschen. `toUserId`-Schutz bleibt: Empfänger können fremde Splits nicht löschen.

**Betroffene Datei:** `server/src/split-requests/routes.ts` — `DELETE /:id` Handler

---

### Bug 2 — Split-Status wird bei Geldeingang nicht persistiert

**Problem:** `autoMatchSplitsForUser` schreibt nur in `split_bank_links`. `split_requests.status` bleibt `'pending'`. "Ausgeglichen" ist nur ein berechneter UI-Zustand — der Empfänger sieht den Split noch als ausstehend, und Statusänderungen bleiben möglich obwohl eine Zahlung eingegangen ist.

**Fix (zwei Stellen):**
1. `autoMatchSplitsForUser` setzt nach dem Link-Insert: `UPDATE split_requests SET status = 'accepted' WHERE id = ?`
2. `PATCH /:id/bank-tx` mit `bankTxId = null` setzt zurück: `UPDATE split_requests SET status = 'pending' WHERE id = ? AND status = 'accepted'`

**Invariante:** Positiver TX-Link vorhanden ↔ Status `'accepted'`. Wird der Link aufgehoben, kehrt der Status zu `'pending'` zurück.

**Betroffene Dateien:** `server/src/bank/routes.ts`, `server/src/split-requests/routes.ts`

---

### Bug 3 — 1:1-Beziehung Beleg↔Kontobewegung nicht erzwungen

**Problem:** `POST /api/bank/match` prüft nicht ob `receiptId` bereits einer anderen Transaktion desselben Users zugeordnet ist. Ein Beleg kann so mehreren Kontobewegungen zugeordnet werden. In `ReceiptTable.tsx` überschreibt `map.set()` bei Duplikaten den ersten Eintrag silently.

**Fix:** Vor dem `updateMatch`-Aufruf prüft der Server:
```sql
SELECT id FROM bank_transactions 
WHERE user_id = ? AND matched_receipt_id = ? AND id != ?
```
Bei Treffer → HTTP 409 mit Fehlermeldung.

**Betroffene Datei:** `server/src/bank/routes.ts` — `POST /match` Handler

---

### Bug 4 — Positive Transaktionen als Beleg-Kandidaten

**Problem:** `KontobewegungZuordnenDialog` zeigt alle ungematchten Transaktionen als Kandidaten — inklusive positiver Geldeingänge. Ein Beleg repräsentiert eine Ausgabe und sollte nur mit einer negativen (ausgehenden) Kontobewegung verknüpft werden.

**Fix:** Kandidatenfilter um `tx.betrag < 0` erweitern.

**Betroffene Datei:** `client/src/components/bank/KontobewegungZuordnenDialog.tsx`

---

### Bug 5 — `BankTxSplitDialog` setzt keine `receiptSqliteId`

**Problem:** Splits die direkt an einer Kontobewegung erstellt werden, haben `receiptSqliteId = null`. Sie erscheinen am Beleg nur indirekt (über matched TX). Bei ungematchten Transaktionen sind sie vom Beleg-Kontext vollständig entkoppelt.

**Fix:** In der neuen gemeinsamen Komponente: wenn Kontext `bankTx` ist und `transaction.matchedReceiptId` gesetzt ist, wird dieses als `receiptSqliteId` beim Erstellen übergeben.

**Betroffene Datei:** Gelöst intern in `SplitEditorDialog.tsx`

---

## Shared Component

### Motivation

`SplitDialog` und `BankTxSplitDialog` teilen ~80% ihres Codes. Jeder Fix muss sonst doppelt gepflegt werden. Die Zusammenführung eliminiert die Duplikation und macht die Submit-Logik zu einer einzigen, testbaren Einheit.

### Neue Dateistruktur

```
NEU:
  client/src/components/splits/PersonPicker.tsx       ← aus beiden Dialogen extrahiert
  client/src/components/splits/SplitEditorDialog.tsx  ← ersetzt SplitDialog + BankTxSplitDialog

GEÄNDERT:
  client/src/pages/Kontoabgleich.tsx                           → SplitEditorDialog
  client/src/components/receipts/ReceiptTable.tsx              → SplitEditorDialog
  client/src/components/bank/KontobewegungZuordnenDialog.tsx   (Bug 4)
  server/src/bank/routes.ts                                    (Bug 2, Bug 3)
  server/src/split-requests/routes.ts                          (Bug 1, Bug 2)

GELÖSCHT:
  client/src/components/receipts/SplitDialog.tsx
  client/src/components/bank/BankTxSplitDialog.tsx
```

`SplitBankTxDialog` (Verknüpfung bestehender Splits mit Bank-TX aus der Aufteilungen-Liste) bleibt unverändert — anderer Zweck, keine Überschneidung.

### Kontext-Typ

```typescript
type SplitContext =
  | {
      type: 'receipt';
      receipt: ReceiptRow;
      linkedBankTxId: string | null;
      existingSplits: OutgoingRequest[];   // direct + bankTx splits
    }
  | {
      type: 'bankTx';
      transaction: BankTransaction;
      existingSplits: OutgoingRequest[];   // splits linked to this tx
    }

interface SplitEditorDialogProps {
  context: SplitContext | null;
  onClose: () => void;
}
```

### Aus dem Kontext abgeleitet (intern)

| Feld | `receipt`-Kontext | `bankTx`-Kontext |
|------|-------------------|-----------------|
| Titel | "Beleg aufteilen" | "Kontobewegung aufteilen" |
| Anzeige-Betrag | `receipt.betrag` | `Math.abs(tx.betrag)` |
| `receiptSqliteId` | `receipt.id` | `tx.matchedReceiptId ?? undefined` |
| `receiptMeta.haendler` | `receipt.haendler` | `tx.haendler` |
| `receiptMeta.datum` | `receipt.datum` | `tx.buchungsdatum` |
| `receiptMeta.gesamtbetrag` | `receipt.betrag` | `Math.abs(tx.betrag)` |
| `receiptId` (Drive) | aus `receipt.driveLink` | — |
| Bank-TX-Link nach Create | `linkedBankTxId` (falls vorhanden) | `tx.id` (immer) |

### Unified Submit-Logik

```
1. Alle existingSplits per DELETE entfernen
   (Server erlaubt es nach Bug-1-Fix für fromUserId ohne Statusprüfung)
2. Valide Items als neue Splits erstellen
   (mit kontextkorrekter receiptSqliteId, receiptMeta, receiptId)
3. Bank-TX-Link per PATCH /:id/bank-tx setzen
   (bei receipt-Kontext: nur wenn linkedBankTxId vorhanden)
   (bei bankTx-Kontext: immer tx.id)
```

### PersonPicker

Identische Komponente aus beiden Dialogen extrahiert. Props:

```typescript
interface PersonPickerProps {
  item: Item;
  index: number;
  knownPersons: string[];
  idPrefix: string;           // für eindeutige datalist-IDs
  onChange: (idx: number, updates: Partial<Item>) => void;
}
```

---

## Nicht im Scope

- `SplitBankTxDialog` — bleibt unverändert
- Partielle Zahlungsabwicklung (Teilbeträge auf mehrere Eingänge aufteilen)
- UI-Feedback wenn 1:1-Konflikt beim manuellen Matching erkannt wird (Toast reicht)
- Schema-Migration für `split_requests` (kein neuer Status, `'accepted'` = bezahlt)

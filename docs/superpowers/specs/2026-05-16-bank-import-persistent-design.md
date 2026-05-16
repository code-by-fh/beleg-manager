# Design: Persistenter ING-CSV-Import mit Verschlüsselung, Duplikatprüfung, Zeitraumfilter & gezieltem Löschen

**Datum:** 2026-05-16  
**Status:** Approved

---

## Zusammenfassung

Der Kontoabgleich wird von einer temporären Sitzungsfunktion zu einem dauerhaften Finanzprotokoll ausgebaut. Transaktionen akkumulieren in der SQLite-DB, werden nie automatisch geleert, und können gezielt (Einzeltransaktion oder Zeitraum) gelöscht werden. Sensible Textfelder (`haendler`, `verwendungszweck`) werden AES-256-GCM-verschlüsselt gespeichert. Die UI erhält monatliche Gruppierung plus freien Datumsbereich-Filter sowie eine Detail-Anzeige für Duplikate nach dem Upload.

---

## 1. Verschlüsselung

**Datei:** `server/src/bank/crypto.ts`

- Algorithmus: AES-256-GCM
- Schlüssel: `process.env.BANK_ENCRYPTION_KEY` (32-Byte, Hex oder Base64)
- Format: `iv:authTag:ciphertext` (alle Base64, Doppelpunkt-getrennt), gespeichert als TEXT
- `encrypt(plaintext: string): string` — erzeugt zufälligen IV pro Aufruf
- `decrypt(ciphertext: string): string` — bei ungültigem Format oder fehlendem Key: Rohwert zurückgeben (Fallback für Alt-Daten)
- Verschlüsselte Felder: `haendler`, `verwendungszweck`
- Nicht verschlüsselt: `betrag`, `buchungsdatum` (werden für DB-Filter und Matching benötigt)

---

## 2. Duplikatprüfung

**Strategie:** App-Schicht-Prüfung vor dem Encrypt, nicht via DB-Unique-Index.

- Vor dem Insert wird für jeden parsed Datensatz geprüft: existiert bereits eine Zeile mit `(user_id, buchungsdatum, betrag, haendler_klartext)`?
- Implementierung: Lade alle bestehenden Transaktionen des Nutzers als `Set<string>` mit Key `${buchungsdatum}|${betrag}|${haendler_klartext}` (haendler wird vor dem Vergleich entschlüsselt)
- Performance: akzeptabel für typische CSV-Größen (<500 Zeilen, <10k gespeicherte Transaktionen)
- Duplikate werden übersprungen, ihre Daten als `DuplicateInfo[]` zurückgegeben

Der bisherige Unique-Index `idx_bank_tx_dedup` bleibt als zweite Sicherheitslinie erhalten (verhindert Race-Conditions).

---

## 3. Datenbankschema

Keine neuen Tabellen. Bestehende `bank_transactions`-Tabelle unverändert im DDL — die Felder `haendler` und `verwendungszweck` speichern ab sofort Ciphertext statt Klartext.

**Migration:** `addColumnIfMissing` fügt nichts Neues hinzu. Alt-Daten (Klartext) werden durch den graceful Decrypt-Fallback weiterhin korrekt angezeigt.

---

## 4. API-Änderungen

### `GET /api/bank/transactions`
- Neue optionale Query-Parameter: `from?: string (YYYY-MM-DD)`, `to?: string (YYYY-MM-DD)`
- Validierung via Zod (`z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()`)
- DB-Filter: `WHERE buchungsdatum >= ? AND buchungsdatum <= ?` (nur wenn Parameter gesetzt)
- Alle zurückgegebenen Transaktionen haben entschlüsselte `haendler`/`verwendungszweck`-Felder

### `POST /api/bank/import`
- Rückgabe erweitert um `duplicates: DuplicateInfo[]`
- `DuplicateInfo`: `{ buchungsdatum: string; haendler: string; betrag: number }`
- `haendler` in `DuplicateInfo` ist Klartext

### `DELETE /api/bank/transactions/:id`
- Löscht einzelne Transaktion des authentifizierten Nutzers
- 404 wenn nicht gefunden oder fremde Transaktion

### `DELETE /api/bank/transactions?from=&to=`
- Löscht alle Transaktionen des Nutzers im Zeitraum `[from, to]` (inklusiv, `buchungsdatum`)
- Beide Parameter Pflicht, Zod-validiert
- Antwort: `{ deleted: number }`

### Entfernt
- `DELETE /api/bank/transactions` (altes "alles löschen") — wird durch die zwei neuen Endpunkte ersetzt

---

## 5. Repository-Änderungen (`transactionRepo.ts`)

Neue/geänderte Methoden:

```ts
listByUser(userId: string, filter?: { from?: string; to?: string }): BankTransaction[]
deleteById(id: string, userId: string): void          // wirft NotFoundError wenn nicht gefunden
deleteByRange(userId: string, from: string, to: string): number  // gibt Anzahl gelöschter Zeilen zurück
countByRange(userId: string, from: string, to: string): number   // für Vorschau im Dialog
```

Alle gelesenen Rows werden durch `decrypt()` transformiert. Alle geschriebenen Rows laufen durch `encrypt()`.

---

## 6. Frontend-Änderungen (`Kontoabgleich.tsx`)

### Filter-Bereich
- Monats-Dropdown: berechnet aus allen vorhandenen Transaktionen die eindeutigen Monate (`YYYY-MM`), sortiert absteigend
- Datumsfelder Von/Bis: `<input type="date">`
- Kopplung: Monat wählen → setzt `from`/`to` auf Monatsanfang/-ende; Von/Bis ändern → Dropdown zeigt "Benutzerdefiniert"
- "Filter zurücksetzen" → leert beide Felder, lädt alle Transaktionen
- Filter-State triggert `refetch` mit Query-Parametern (`queryKey: ["bank-transactions", { from, to }]`)

### Duplikat-Feedback
- Neuer State `lastDuplicates: DuplicateInfo[]`
- Aufklappbarer Bereich unter der Upload-Zone (kein Modal): zeigt Liste mit max. 10 Einträgen, Rest als "… und N weitere"
- Felder pro Eintrag: Datum · Händler · Betrag

### Löschen
- **Einzeltransaktion:** Mülleimer-Icon (`Trash2`) in jeder Tabellenzeile (alle drei Tabs). Click → Inline-Confirm direkt in der Zeile ("Löschen?" + ✓/✗), dann `DELETE /api/bank/transactions/:id`
- **Zeitraum:** Button "Zeitraum löschen" in der Aktionsleiste. Öffnet Dialog mit Von/Bis-Feldern. Nach Eingabe: zeigt Vorschau ("X Transaktionen werden gelöscht"), Bestätigung → `DELETE /api/bank/transactions?from=&to=`

### Entfernt
- Button "Abgleich abschließen"
- `confirmClear`-State und zugehöriger Dialog
- `clearTransactions`-API-Aufruf
- `busyClear`-State

### API-Client (`client/src/api/bank.ts`)
- `clearTransactions` entfernen
- `deleteTransaction(id: string)` hinzufügen
- `deleteRange(from: string, to: string)` hinzufügen
- `listTransactions(filter?: { from?: string; to?: string })` erweitern

### Typen (`client/src/types/bank.ts`)
- `DuplicateInfo` hinzufügen: `{ buchungsdatum: string; haendler: string; betrag: number }`
- `ImportResult.duplicates: DuplicateInfo[]` hinzufügen

---

## 7. Umgebungsvariable

`.env` bekommt einen neuen Eintrag:
```
BANK_ENCRYPTION_KEY=<32-Byte Hex-String>
```

Der Server loggt beim Start eine Warnung wenn `BANK_ENCRYPTION_KEY` fehlt, verschlüsselt dann aber nicht (Fallback: Klartext). Das ermöglicht bestehende Dev-Setups ohne sofortigen Bruch.

---

## 8. Nicht im Scope

- Rückwirkende Verschlüsselung bestehender Alt-Daten (graceful fallback reicht)
- Verschlüsselung von `betrag` oder `buchungsdatum`
- Verschlüsselung anderer Felder außerhalb der Bank-Tabelle
- Pagination der Transaktionsliste

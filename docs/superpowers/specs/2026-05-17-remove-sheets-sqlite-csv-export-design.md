# Design: Google Sheets entfernen — SQLite als primäres Backend + CSV-Export

**Datum:** 2026-05-17  
**Status:** Genehmigt

## Zusammenfassung

Google Sheets wird als primärer Datenspeicher für bestätigte Belege vollständig entfernt. SQLite übernimmt diese Rolle. Als Ersatz für den bisherigen Sheets-Export bietet die App einen CSV-Download aller Belege an. Google Drive bleibt für die Dateispeicherung (Fotos, PDFs) erhalten.

## Motivation

- Google Sheets als Datenspeicher ist eine Fehlerquelle: Quota-Limits, Netzwerkfehler, Schema-Drift, Duplikat-Prüfungen über das Netz.
- SQLite ist bereits vorhanden und verwaltet alle anderen App-Daten (Sessions, User, Bank-Transaktionen, Split-Requests).
- Konsistente, lokale Datenhaltung vereinfacht Fehlersuche und Testing erheblich.

## Nicht im Scope

- Migration bestehender Sheets-Daten → frischer Start, alte Daten verbleiben in Sheets.
- Excel (.xlsx) Export → nur CSV in dieser Version.
- Änderungen an Google Drive (Datei-Upload, Archivierung, Ordnerstruktur).

---

## Abschnitt 1: Datenbank

### Neue Tabelle: `receipts`

```sql
CREATE TABLE IF NOT EXISTS receipts (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id),
  datum            TEXT NOT NULL,
  haendler         TEXT NOT NULL,
  betrag           REAL NOT NULL,
  mwst             REAL NOT NULL DEFAULT 0,
  trinkgeld        REAL NOT NULL DEFAULT 0,
  waehrung         TEXT NOT NULL DEFAULT 'EUR',
  kategorie        TEXT NOT NULL DEFAULT '',
  zahlungsmethode  TEXT NOT NULL DEFAULT '',
  rechnungsnummer  TEXT NOT NULL DEFAULT '',
  drive_link       TEXT NOT NULL DEFAULT '',
  eingabe_typ      TEXT NOT NULL DEFAULT 'foto',
  erstellt_am      TEXT NOT NULL
);
```

- `user_id` Foreign Key auf `users.id` — multi-tenant, konsistent mit der restlichen DB.
- Spalten entsprechen exakt dem bisherigen `SHEET_HEADER` aus `google/sheets.ts`.
- Die Spalte `sheetId` in der `users`-Tabelle wird nicht entfernt (kein Breaking-Schema-Change), aber ab sofort ignoriert.

### Duplikat-Prüfung

Die bisherige `checkDuplicateRow`-Funktion (Sheets-API-Call) wird durch eine SQLite-Abfrage ersetzt:

```sql
SELECT 1 FROM receipts
WHERE user_id = ?
  AND haendler = ?
  AND betrag = ?
  AND ABS(JULIANDAY(datum) - JULIANDAY(?)) <= 1
LIMIT 1
```

---

## Abschnitt 2: Server

### Dateien die entfernt werden

- `server/src/google/sheets.ts` — vollständig gelöscht.

### Dateien die angepasst werden

| Datei | Änderung |
|---|---|
| `server/src/db/schema.ts` (oder Migration) | `receipts`-Tabelle hinzufügen |
| `server/src/receipts/routes.ts` | Sheets-Calls → SQLite-Queries |
| `server/src/drive/routes.ts` | `appendRow` → SQLite `INSERT` |
| `server/src/inbox/poller.ts` | `appendRow` + `checkDuplicate` → SQLite |
| `server/src/telegram/bot.ts` | `appendRow` → SQLite `INSERT` |
| `server/src/splits/routes.ts` | Splits-Sheets-Calls entfernen (Splits sind bereits in SQLite) |
| `server/src/stats/compute.ts` | `readAllRows` → SQLite `SELECT` |
| `server/src/stats/routes.ts` | Sheets-Auth entfernen |
| `server/src/google/bootstrap.ts` | `createSpreadsheet` + `moveSpreadsheetIntoFolder` entfernen |

### Neuer Endpunkt: CSV-Export

```
GET /api/receipts/export/csv
```

- Authentifizierung erforderlich (wie alle `/api/receipts`-Routen).
- Liest alle Belege des eingeloggten Users aus SQLite.
- Gibt CSV zurück mit Header `Content-Disposition: attachment; filename="belege.csv"`.
- Spaltenreihenfolge: `id, datum, haendler, betrag, mwst, trinkgeld, waehrung, kategorie, zahlungsmethode, rechnungsnummer, drive_link, eingabe_typ, erstellt_am`.
- Keine externe Bibliothek — CSV wird manuell serialisiert (Felder mit Anführungszeichen, Komma als Trennzeichen).

---

## Abschnitt 3: Frontend

### CSV-Export-Button

- Platzierung: Belege-Seite (Receipts-Listenansicht), in der bestehenden Header/Toolbar-Zeile.
- Implementierung: `<a href="/api/receipts/export/csv" download>` — Browser löst Download direkt aus, kein zusätzlicher State oder API-Client nötig.

### Statistiken

- `stats/compute.ts` liest zukünftig aus SQLite → Dashboard-Widgets funktionieren weiterhin unverändert.
- Keine Frontend-Änderungen an Stats/Dashboard nötig.

### Keine weiteren Frontend-Änderungen

Google Sheets war rein serverseitig — keine Sheets-bezogenen Types oder API-Calls im Client-Code.

---

## Nicht betroffene Bereiche

- Google OAuth 2.0 (Authentifizierung bleibt unverändert)
- Google Drive (Datei-Upload, Archivierung, Inbox-Poller-Dateistatus)
- Gmail-Poller
- Telegram Bot (nur `appendRow`-Aufruf wird ersetzt)
- Bank-Transaktionen / Kontoabgleich
- Split-Requests (bereits vollständig in SQLite)
- Monitoring-Seite

# Beleg-Manager — Design-Dokument

**Datum:** 2026-05-07
**Status:** Approved (vom Nutzer bestätigte Design-Sektionen)

## 1. Ziel

Eine Webanwendung, mit der Nutzer Belege (Rechnungen, Quittungen) per Foto, Sprache oder über einen Google-Drive-Inbox-Ordner erfassen. Die App extrahiert mit der Gemini-API die relevanten Felder, archiviert das Original strukturiert in Google Drive und schreibt die Daten in eine Google-Sheet-Tabelle im Drive des Nutzers.

## 2. Tech-Stack

- **Frontend:** Vite + React 18 + TypeScript + Tailwind + shadcn/ui
- **Backend:** Node.js + Express + TypeScript
- **Auth:** Google OAuth 2.0 (Passport.js)
- **Sessions:** express-session + connect-sqlite3
- **DB (lokal, nur Metadaten):** SQLite
- **AI:** Google Gemini API (`gemini-2.5-flash`)
- **Google APIs:** Drive v3, Sheets v4
- **Routing-Frontend:** React Router v6
- **Server-State:** TanStack Query (React Query)
- **Forms:** React Hook Form + Zod
- **Charts:** Recharts
- **Testing:** Vitest + supertest + React Testing Library + Playwright (smoke)

## 3. Architektur

Monorepo mit npm-Workspaces:

```
beleg-manager/
  client/                React-SPA (Vite)
  server/                Express-API + BFF
  package.json           workspaces: ["client", "server"]
  docs/
```

Der Express-Server fungiert als Backend-for-Frontend (BFF):
- Hält Google-OAuth-Tokens serverseitig in verschlüsselten Sessions (httpOnly Cookies).
- Der Client hat nie direkten Zugriff auf Google-Tokens.
- Alle Drive-, Sheets- und Gemini-Aufrufe laufen über den Server.
- In Production serviert Express die gebauten Vite-Dist-Files.

## 4. Authentifizierung & Sicherheit

### Google OAuth

- Library: `passport` + `passport-google-oauth20`
- Scopes:
  - `openid email profile`
  - `https://www.googleapis.com/auth/drive.file` (nur App-eigene Dateien)
  - `https://www.googleapis.com/auth/spreadsheets`
- `accessType: 'offline'`, `prompt: 'consent'` für Refresh-Token

### Session

- Cookie: `httpOnly`, `secure` (Prod), `sameSite: 'lax'`, 30 Tage
- Inhalt: `userId`, verschlüsselte Access- und Refresh-Tokens
- Token-Refresh: automatisch durch `googleapis`-OAuth2-Client (sofern Refresh-Token vorhanden)

### Lokale DB (SQLite)

```sql
users (
  id TEXT PRIMARY KEY,           -- Google Subject-ID
  email TEXT,
  name TEXT,
  drive_root_folder_id TEXT,
  drive_inbox_folder_id TEXT,
  drive_archive_folder_id TEXT,
  sheet_id TEXT,
  created_at INTEGER
)
sessions   -- verwaltet von connect-sqlite3
```

Keine Belegdaten lokal — alles in Drive/Sheets des Nutzers (Single Source of Truth).

### Sicherheitsmaßnahmen

- CSRF-Schutz für State-changing Endpoints (Double-Submit-Cookie)
- `express-rate-limit` auf Upload-Routes (60 req/min/user)
- Multer: max 10 MB pro Datei, MIME-Whitelist: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`
- `helmet` für HTTP-Header
- Secrets in `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY`, `SESSION_SECRET`, `OAUTH_CALLBACK_URL`

## 5. Daten-Struktur

### Google-Drive-Ordner (pro Nutzer, beim ersten Login automatisch angelegt)

```
My Drive/
  Beleg-Manager/
    Inbox/                    Drop-Folder für automatische Verarbeitung
    Archive/
      2026/
        01/
        02/
        ...
    belege.xlsx               Google Sheet (zentrale Tabelle)
```

### Google-Sheet-Spalten

| Spalte             | Typ      | Beschreibung |
|--------------------|----------|--------------|
| `id`               | UUID     | App-generiert |
| `datum`            | ISO-Date | Belegdatum (von Gemini extrahiert) |
| `haendler`         | Text     | Aussteller |
| `betrag`           | Decimal  | Bruttobetrag |
| `mwst`             | Decimal  | MwSt-Betrag (0 wenn nicht ausgewiesen) |
| `waehrung`         | Text     | EUR/USD/... |
| `kategorie`        | Text     | Frei wählbar |
| `zahlungsmethode`  | Text     | Bar/Karte/Überweisung/... |
| `rechnungsnummer`  | Text     | falls vorhanden |
| `drive_link`       | URL      | Privater Drive-Link zum archivierten Original |
| `eingabe_typ`      | Enum     | `foto` / `sprache` / `drive` |
| `erstellt_am`      | ISO-DT   | Timestamp der Verarbeitung |

## 6. API-Endpoints (Express)

| Methode | Pfad | Zweck |
|---------|------|-------|
| GET  | `/api/auth/google`           | OAuth-Login starten |
| GET  | `/api/auth/google/callback`  | OAuth-Callback, Session anlegen, First-Login-Bootstrap |
| POST | `/api/auth/logout`           | Session beenden |
| GET  | `/api/auth/me`               | Aktueller Nutzer (für Frontend-State) |
| POST | `/api/receipts/upload`       | Multipart Foto-Upload + optionales Sprach-Transkript → Gemini → liefert Extraktions-Vorschau (noch nicht persistiert) |
| POST | `/api/receipts/voice`        | Reines Sprach-Transkript → Gemini → Extraktions-Vorschau |
| POST | `/api/receipts/confirm`      | Nutzer bestätigt nach Review → Drive-Archive + Sheet-Append |
| GET  | `/api/receipts`              | Alle Belege aus Sheet (mit Pagination + Filter) |
| GET  | `/api/drive/inbox`           | Dateien im Inbox-Ordner auflisten |
| POST | `/api/drive/import/:fileId`  | Datei aus Inbox-Ordner manuell importieren → liefert Extraktions-Vorschau |
| GET  | `/api/stats/summary`         | Kennzahlen für Dashboard (Monat, Jahr, Anzahl, Top-Kategorie) |
| GET  | `/api/stats/monthly`         | Letzte 12 Monate für Liniendiagramm |
| GET  | `/api/stats/categories`      | Aufschlüsselung nach Kategorie für Donut |

## 7. Server-Module

```
server/src/
  auth/                         Passport-Strategie + Auth-Routes
  session/                      SQLite Session Store + DB-Helper
  google/
    client.ts                   OAuth2-Client-Factory pro User-Session
    drive.ts                    Drive-Operationen (Ordner, Datei verschieben, Link)
    sheets.ts                   Sheets-Operationen (Append, Read)
    bootstrap.ts                First-Login-Setup (Ordner + Sheet anlegen)
  gemini/
    extract.ts                  Foto/Text → strukturiertes JSON
    prompts.ts                  Versionierte Prompts
    schema.ts                   Zod- und Gemini-responseSchema
  receipts/
    pipeline.ts                 End-to-End: Eingabe → Gemini → Vorschau
    archive.ts                  Datei nach Archive/JJJJ/MM/ verschieben
    persist.ts                  Confirm-Flow: Archivieren + Sheet-Append
  inbox/
    poller.ts                   node-cron Job (alle 5 Min)
  routes/                       Dünne Express-Router
  middleware/                   requireAuth, errorHandler, multer, csrf, rateLimit
  config.ts                     ENV-Loading mit Zod-Validierung
  server.ts                     Bootstrap
```

Jedes Modul hat eine klare Aufgabe und kann unabhängig getestet werden. Die Routes-Schicht bleibt dünn — Business-Logic in Services.

## 8. Frontend-Module

```
client/src/
  pages/
    Login.tsx
    Dashboard.tsx
    Upload.tsx                  Tabs: Foto / Kamera / Sprache / Drive-Inbox
    Review.tsx                  Korrektur extrahierter Daten vor Speichern
    Settings.tsx                Kategorien verwalten, Drive-Ordner zurücksetzen
  components/
    ui/                         shadcn-Komponenten
    receipts/
      ReceiptTable.tsx
      ReceiptFilters.tsx
      ReceiptForm.tsx           Wiederverwendbar in Review
    upload/
      PhotoUpload.tsx
      CameraCapture.tsx         MediaDevices.getUserMedia
      VoiceInput.tsx            Web Speech API (de-DE)
      DriveInbox.tsx
    stats/
      KpiCards.tsx
      MonthlyChart.tsx
      CategoryDonut.tsx
  hooks/
    useAuth.ts
    useReceipts.ts
    useStats.ts
  api/
    client.ts                   Fetch-Wrapper (Cookie-Credentials)
    receipts.ts
    drive.ts
    stats.ts
  lib/
    formatters.ts
    validators.ts               Zod-Schemas
  App.tsx
  main.tsx
```

## 9. Verarbeitungs-Flow

### Foto-Upload (oder Kamera-Aufnahme)

1. Frontend: Bild + optionales Sprach-Transkript via Multipart an `POST /api/receipts/upload`
2. Backend: Bild an Gemini Vision API (mit `responseSchema` für strukturierte Antwort)
3. Backend: Liefert extrahiertes JSON + temporäre File-ID an Frontend
4. Frontend: Review-Seite zeigt Felder, Nutzer korrigiert ggf.
5. Frontend: `POST /api/receipts/confirm` mit ID + ggf. korrigierten Feldern
6. Backend: Datei nach `Archive/JJJJ/MM/` verschieben (Datum aus Beleg-Datum), Drive-Link erzeugen, Zeile ins Sheet appenden

### Sprach-Eingabe (standalone)

1. Browser: Web Speech API erzeugt Transkript (de-DE)
2. Frontend: `POST /api/receipts/voice` mit Transkript
3. Backend: Transkript an Gemini Text API mit gleichem `responseSchema`
4. Ab Schritt 4 wie Foto-Flow (es gibt keine Datei zum Archivieren — `drive_link` bleibt leer)

### Drive-Inbox (automatisch oder manuell)

- **Automatisch (Poller):** Alle 5 Minuten listet `inbox/poller.ts` für jeden Nutzer mit gültigem Refresh-Token die Dateien im Inbox-Ordner. Pro Datei: Gemini-Extraktion → das Ergebnis-JSON wird in den Drive-`appProperties` der Datei abgelegt (Key `bm_extracted_json`, Key `bm_status: pending_review`). Die Datei bleibt im Inbox-Ordner. Im Frontend zeigt `GET /api/drive/inbox` solche Dateien als "Bereit zum Review", Nutzer klickt "Bestätigen" → `POST /api/receipts/confirm` archiviert + schreibt ins Sheet.
- **Manuell:** `GET /api/drive/inbox` listet alle Dateien (mit oder ohne `appProperties`). Klick auf eine noch nicht extrahierte Datei triggert `POST /api/drive/import/:fileId` → Gemini → Review-Seite (gleicher Flow wie Foto-Upload).
- Nach Confirm wird die Datei aus dem Inbox-Ordner ins Archiv verschoben (Drive-File-Move, kein Copy). Bei Fehlern in der Extraktion (z.B. Gemini-Timeout): Datei verbleibt in Inbox, `appProperties.bm_status: failed` mit Fehlermeldung.

Vorteil dieses Ansatzes: Keine zusätzliche Server-DB-Tabelle für eine "Queue"; die Inbox-Datei selbst ist die Queue. Stateless auf Server-Seite.

## 10. Gemini-Integration

- **Modell:** `gemini-2.5-flash`
- **Strukturierte Ausgabe:** `responseMimeType: "application/json"` + `responseSchema` mit allen Feldern aus Sektion 5 (fehlende Werte als `null`)
- **Prompt-Versionierung:** Prompts in `server/src/gemini/prompts.ts` mit Versions-Konstante (für spätere A/B-Tests)
- **Eingabe-Typen:**
  - **Foto:** `parts: [imagePart, textPrompt]`
  - **Sprache:** `parts: [transkriptText, textPrompt]`
  - **Foto + Sprache:** `parts: [imagePart, "Zusatzkontext: ..." + transkript, textPrompt]`
- **Datums-Hinweis im Prompt:** "Liefere `datum` immer als ISO-8601 (`YYYY-MM-DD`). Wenn nur Monat/Jahr erkennbar, nimm den 1. des Monats."
- **Fallback:** Bei Gemini-Fehler oder leerer Antwort → leeres JSON, Frontend zeigt leeres Formular zum manuellen Ausfüllen.

## 11. Fehlerbehandlung

| Fehlerquelle | Strategie |
|---|---|
| Gemini-API Fehler/Timeout | Leeres Formular im Review-Schritt, Toast-Hinweis |
| Drive-API Fehler | Retry mit Exponential Backoff (max 3x), dann User-Toast |
| Sheets-API Fehler | Wie Drive |
| Inbox-Poller Fehler | Logging, kein User-Impact (nächster Tick versucht erneut) |
| Token expired + Refresh fehlschlägt | Session löschen, Nutzer auf Login umleiten |
| Upload zu groß / falscher MIME | 4xx mit klarer Fehlermeldung |

## 12. Testing

| Schicht | Tool | Inhalt |
|---|------|--------|
| Server-Units | Vitest | Pure-Functions: Gemini-Response-Parsing, Datum→Archiv-Pfad, Sheet-Row-Mapping |
| Server-Integration | Vitest + supertest | Express-Routes mit gemockten Google/Gemini-Clients |
| Client-Units | Vitest + RTL | Form-Validierung (Review), Filter-Logik (Tabelle) |
| E2E-Smoke | Playwright | Login-Flow, Foto-Upload-Happy-Path |

Nicht getestet: UI-Snapshots, triviale shadcn-Wrapper, echte Google-API-Calls (gemockt).

## 13. Deployment & Setup

- **Dev:** `npm run dev` startet Vite + Express parallel (concurrently)
- **Build:** `npm run build` → `client/dist` + `server/dist`
- **Prod-Start:** `node server/dist/server.js`, Express serviert `client/dist` statisch
- **Persistenz:** SQLite-Datei (`data/app.db`) auf Volume
- **README:** Setup-Anleitung für Google-Cloud-Console (OAuth-Client erstellen, Drive- & Sheets-API aktivieren) sowie Gemini-API-Key

## 13.1 Bekannte Browser-Einschränkungen

- **Web Speech API:** Voll unterstützt in Chrome, Edge, Safari (Desktop & iOS). In Firefox eingeschränkt — UI zeigt einen klaren Hinweis und blendet den Sprach-Tab aus, wenn die API nicht verfügbar ist.
- **Kamera-Capture:** Erfordert HTTPS in Production (auch im LAN). Lokale Entwicklung über `localhost` funktioniert ohne HTTPS.

## 14. Aus dem Scope ausgeschlossen (YAGNI)

- Mehrsprachiges UI (nur Deutsch im UI, deutsches Voice-Locale)
- Native Mobile App (Web ist responsiv, Kamera funktioniert auf Mobile-Browsern)
- Team- oder Org-Features (User-Entscheidung: jeder hat eigene Daten)
- Budget-Tracking, Export-Funktionen (Dashboard-Option C nicht gewählt)
- Editierbare Belege im Dashboard (Korrektur erfolgt im Review-Schritt vor Speichern)
- Externe DB (PostgreSQL, etc.) — SQLite reicht für lokale Metadaten

## 15. Offene Punkte für die Implementierung

- Konkrete Standard-Kategorien-Liste beim ersten Login (z.B. Restaurant, Tankstelle, Büro, Reise, Sonstiges)
- Soll der Nutzer im Settings die Standard-Währung setzen können? (Default: EUR)
- Inbox-Poller: Welche Aktion bei Dateien, deren Verarbeitung scheitert? (Vorschlag: in `Inbox/_failed/` verschieben)

Diese drei Punkte können in der Implementierungs-Plan-Phase entschieden werden — sie ändern die Architektur nicht.

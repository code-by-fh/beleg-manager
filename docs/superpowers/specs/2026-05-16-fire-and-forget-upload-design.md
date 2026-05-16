# Fire-and-Forget Upload — Design-Dokument

**Datum:** 2026-05-16  
**Status:** Approved  
**Bezug:** Ergänzung zu `2026-05-07-beleg-manager-design.md`

## 1. Ziel

Der Upload-Flow auf `/upload` wird von synchron (warten auf Gemini → Review-Screen) zu "fire and forget" umgebaut. Der Nutzer lädt hoch und kehrt sofort zur Idle-Ansicht zurück. Verarbeitung passiert im Hintergrund. Nur im Fehlerfall (Gemini nicht erreichbar, nichts erkannt) wird der Beleg als fehlgeschlagen markiert und in der Belege-Ansicht zur Nachbearbeitung angezeigt.

## 2. Neuer Upload-Flow

### 2.1 Datei-Upload (Foto / PDF)

| Schritt | Wer | Was |
|---------|-----|-----|
| 1 | Client | `POST /api/receipts/upload` mit Multipart-Datei |
| 2 | Server | Datei in Drive-Inbox-Ordner des Nutzers hochladen (Drive API) |
| 3 | Server | `202 Accepted` — kein `pendingId`, keine Extraktion |
| 4 | Client | Toast "Beleg wird verarbeitet…", Reset auf Idle-Ansicht |
| 5 | Poller | Alle 5 Min: Gemini-Extraktion → bei Erfolg: `appendRow` in Sheets + Archivierung; bei Fehler: `appProperties.bm_status = "failed"`, `bm_error = "<reason>"` |

Der bisherige synchrone Gemini-Aufruf in `POST /api/receipts/upload` entfällt. Der Server macht nur noch den Drive-Upload.

### 2.2 Text / Sprache-Eingabe

| Schritt | Wer | Was |
|---------|-----|-----|
| 1 | Client | `POST /api/receipts/voice` mit Transcript |
| 2 | Server | Gemini synchron aufrufen (Text ist schnell, ~1–2 s) |
| 3a (Erfolg) | Server | `appendRow` direkt in Sheets → `200 OK { ok: true }` |
| 3b (Fehler) | Server | Eintrag in `failed_voice_jobs` → `202 Accepted { jobId }` |
| 4a | Client | Toast "Beleg gespeichert" |
| 4b | Client | Toast "Fehler — erscheint unter Belege zur Nachbearbeitung" |

### 2.3 Was wegfällt

- Navigation zu `/review/:pendingId` nach Upload
- `AIProcessingOverlay` (langer Warte-Spinner) im `UnifiedInput`
- Synchroner Gemini-Aufruf in `POST /api/receipts/upload`

Der `pendingStore` und der `/review`-Screen bleiben erhalten — sie werden noch vom Drive-Inbox-Manuell-Import genutzt.

## 3. Datenmodell

### 3.1 Neue SQLite-Tabelle: `failed_voice_jobs`

```sql
CREATE TABLE failed_voice_jobs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  transcript TEXT NOT NULL,
  error      TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

Kein BLOB, kein Buffer — nur Text. Wird via bestehende `migrations.ts` angelegt.

### 3.2 Drive-Inbox-Fehler (unverändert)

Der bestehende Poller setzt `appProperties.bm_status = "failed"` bei Fehlern. `GET /api/drive/inbox` liefert diese Dateien bereits mit `status: "failed"`. Kein neues Schema nötig.

## 4. API-Änderungen

| Methode | Pfad | Änderung |
|---------|------|----------|
| `POST` | `/api/receipts/upload` | Kein Gemini mehr — nur Drive-Upload → `202` |
| `POST` | `/api/receipts/voice` | Bei Erfolg: direkt Sheets (kein `pendingId`); bei Fehler: SQLite-Job → `202` |
| `GET`  | `/api/receipts/failed-voice` | **Neu** — liefert alle `failed_voice_jobs` des Nutzers |
| `POST` | `/api/receipts/retry-voice/:jobId` | **Neu** — Gemini neu aufrufen; bei Erfolg: Sheets + Job löschen |
| `POST` | `/api/drive/retry/:fileId` | **Neu** — Alias für bestehenden `/api/drive/import/:fileId`-Flow (Gemini + Archivierung) |

## 5. UI-Änderungen

### 5.1 `UnifiedInput.tsx`

- `submit()`: nach `202` → Reset auf Idle, Toast statt `navigate('/review/...')`
- `AIProcessingOverlay` entfernen
- Loading-State bleibt für den kurzen Drive-Upload (~1 s)

### 5.2 `/receipts` — Fehlerliste

Neuer Bereich "Fehlgeschlagene Belege" ganz oben, nur sichtbar wenn Fehler vorhanden.

Datenquellen:
- Drive-Fehler: aus bestehendem `useDriveInbox()` Hook, gefiltert auf `status === "failed"`
- Voice-Fehler: neuer `useFailedVoiceJobs()` Hook → `GET /api/receipts/failed-voice`

Aktionen:
- Retry-Button → jeweiligen Retry-Endpoint aufrufen → optimistisch aus Liste entfernen → Toast
- Einträge werden automatisch aus der Liste entfernt sobald Retry erfolgreich

### 5.3 `AppShell.tsx` — Badge auf "Belege"

Bestehendes Badge auf "Erfassen" (Inbox-Count) bleibt unverändert.

Neues rotes Badge auf "Belege" wenn `failedVoiceCount + failedDriveCount > 0`.

## 6. Fehlerbehandlung

| Fehlerquelle | Verhalten |
|---|---|
| Gemini-Fehler bei Datei-Upload | Poller setzt `bm_status: failed` auf Drive-Datei |
| Gemini-Fehler bei Voice | SQLite `failed_voice_jobs` Eintrag |
| Drive-Upload schlägt fehl (beim Upload-Endpoint) | `500` zurück, Client zeigt Toast "Upload fehlgeschlagen" |
| Retry schlägt nochmals fehl | Fehler-Eintrag bleibt erhalten, Toast mit Fehlermeldung |

## 7. Nicht im Scope

- Automatischer Retry mit Backoff (manueller Retry reicht)
- Push-Notification wenn Hintergrundverarbeitung fertig ist
- Editierbare Felder im Fehler-Eintrag (Retry → Gemini; kein manuelles Formular)

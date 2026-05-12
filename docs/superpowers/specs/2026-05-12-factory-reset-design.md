# Factory Reset Funktion — Design-Dokument

**Datum:** 2026-05-12
**Status:** Approved (Nutzer-bestätigte Design-Sektionen)

## 1. Ziel

Eine sichere Factory-Reset-Funktion, mit der Nutzer ihre lokalen Daten und/oder Google-Drive-Daten zurücksetzen können. Die Operation erfordert doppelte Bestätigung und wird mit Retry-Logik ausgeführt.

## 2. Anforderungen

- **Zwei unabhängige Reset-Optionen:**
  - A: Lokale Daten (SQLite User-Record + Sessions) löschen
  - B: Google Drive (Beleg-Manager-Ordner + Sheet) löschen
- **Benutzer wählt Optionen**, klickt "Reset starten"
- **Bestätigungs-Dialog** mit Zusammenfassung der gewählten Optionen
- **Doppelte Bestätigung:** Checkbox ("Ich verstehe, dass dies nicht rückgängig gemacht werden kann") + Button
- **UI-Platzierung:** Settings-Seite unter neuer Sektion "Gefahrenzone"
- **Nach erfolgreichem Reset:** Umleitung zu `/login` mit Toast-Message "Factory Reset abgeschlossen"
- **Fehlerbehandlung:** Retry-Logik (3x mit Exponential Backoff) für Google Drive; bei Fehlern: Status 207 mit Details

## 3. Backend-Architektur

### 3.1 Neue Module

**`server/src/admin/factoryReset.ts`** — Geschäftslogik
- `resetLocalData(userId: string): Promise<ResetResult>` — löscht User-Record + alle Sessions aus SQLite
- `resetGoogleDrive(googleClient: GoogleClient, userId: string): Promise<ResetResult>` — löscht Beleg-Manager-Ordner & Sheet mit Retry-Logik
- `interface ResetResult { success: boolean; message: string; retried?: number }`

**`server/src/admin/routes.ts`** — Express-Router
- `POST /api/admin/factory-reset` (protected by `requireAuth`)
- Koordiniert beide Operationen basierend auf Request-Body `{ localData: boolean, googleDrive: boolean }`

### 3.2 Fehlerbehandlung

| Operation | Retry | Fallback |
|---|---|---|
| SQLite User-Löschung | Nein (fatal) | Error 500 |
| SQLite Sessions-Löschung | Nein (fatal) | Error 500 |
| Google Drive Ordner löschen | Ja, 3x, exponential backoff | Error mit retried-Count |
| Google Drive Sheet löschen | Ja, 3x, exponential backoff | Error mit retried-Count |

**Retry-Strategie für Google Drive:**
- Versuch 1: sofort
- Versuch 2: nach 100ms
- Versuch 3: nach 200ms
- Bei Fehler nach Versuch 3: `ResetResult { success: false, message: "...", retried: 3 }`

**Response-Status:**
- `200 OK`: Alle Operationen erfolgreich
- `207 Multi-Status`: Einige Operationen erfolgreich, manche fehlgeschlagen
- `500 Internal Server Error`: Kritische Fehler (z.B. SQLite)

### 3.3 Logging

Jede Factory-Reset-Operation wird geloggt:
```
[factory-reset] userId=abc123 localData=true googleDrive=false result=success timestamp=2026-05-12T10:30:00Z
[factory-reset] userId=abc123 googleDrive=true result=failed_after_3_retries error="Google Drive API quota exceeded" timestamp=2026-05-12T10:30:05Z
```

## 4. API-Endpoint

**POST `/api/admin/factory-reset`** (protected by `requireAuth`)

**Request Body:**
```json
{
  "localData": boolean,
  "googleDrive": boolean
}
```

**Response (200 Success):**
```json
{
  "success": true,
  "message": "Factory Reset abgeschlossen",
  "results": {
    "localData": {
      "success": true,
      "message": "Lokale Daten und Sessions gelöscht"
    },
    "googleDrive": {
      "success": true,
      "message": "Beleg-Manager-Ordner und Sheet gelöscht"
    }
  }
}
```

**Response (207 Partial Success):**
```json
{
  "success": false,
  "message": "Factory Reset teilweise erfolgreich",
  "results": {
    "localData": {
      "success": true,
      "message": "Lokale Daten und Sessions gelöscht"
    },
    "googleDrive": {
      "success": false,
      "message": "Nach 3 Versuchen fehlgeschlagen: Google Drive API quota exceeded",
      "retried": 3
    }
  }
}
```

**Response (400/500 Error):**
```json
{
  "success": false,
  "error": "Invalid request / Internal server error",
  "details": "..."
}
```

## 5. Frontend-Komponenten

### 5.1 Settings-Seite (Erweiterung)

Neue Sektion in `client/src/pages/Settings.tsx`:
```
┌─ Gefahrenzone ────────────────────────┐
│                                        │
│ □ Lokale Daten löschen                │
│ □ Google Drive Daten löschen          │
│                                        │
│ [Reset starten]        [Abbrechen]    │
└────────────────────────────────────────┘
```

### 5.2 Bestätigungs-Dialog

Nach Klick auf "Reset starten":

**Dialog 1 — Zusammenfassung + Bestätigung:**
```
┌─ Factory Reset bestätigen ────────────┐
│                                        │
│ Folgende Daten werden gelöscht:       │
│ • Lokale Daten (SQLite-DB)            │
│ • Google Drive Beleg-Manager          │
│   - Ordner Archive/, Inbox/           │
│   - Sheet belege.xlsx                 │
│                                        │
│ ☐ Ich verstehe, dass dies nicht       │
│   rückgängig gemacht werden kann      │
│                                        │
│ [Bestätigen]         [Abbrechen]      │
└────────────────────────────────────────┘
```

Nach Checkbox-Bestätigung: Button wird aktiv.

**Dialog 2 — Spinner während Verarbeitung:**
```
┌─ Factory Reset läuft ─────────────────┐
│                                        │
│          ⟳ Wird verarbeitet...        │
│                                        │
│ Bitte warten, dies kann 30 Sekunden   │
│ dauern...                              │
│                                        │
│ [Abbrechen] (disabled)                │
└────────────────────────────────────────┘
```

### 5.3 Frontend-Hook

Neuer Hook `client/src/hooks/useFactoryReset.ts`:
```typescript
export function useFactoryReset() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const execute = async (options: { localData: boolean; googleDrive: boolean }) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/factory-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
        credentials: "include"
      });
      
      const data = await res.json();
      
      if (res.ok || res.status === 207) {
        toast({ title: "Factory Reset abgeschlossen", variant: "default" });
        setTimeout(() => navigate("/login"), 1500);
      } else {
        toast({ title: "Fehler beim Reset", description: data.details, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  return { execute, loading };
}
```

## 6. Datenbankoperationen

### 6.1 Lokale Daten löschen

```sql
-- Alle Sessions des Nutzers löschen
DELETE FROM sessions WHERE sid IN (
  SELECT sid FROM sessions WHERE data LIKE '%"userId":"<USER_ID>"%'
);

-- User-Record löschen
DELETE FROM users WHERE id = '<USER_ID>';
```

### 6.2 Google Drive löschen

1. Abrufen von `users.drive_root_folder_id` aus Datenbank
2. Für Drive-Datei/Ordner: `drive.files.delete()` mit Retry-Logik
3. Beleg-Manager-Ordner (Root) wird mit allen Unterordnern rekursiv gelöscht
4. Sheet-ID aus `users.sheet_id` löschen (als Datei in Drive)

## 7. Testing-Strategie

| Test | Typ | Beschreibung |
|---|---|---|
| `resetLocalData.test.ts` | Unit | SQLite Delete-Operationen, Edge-Cases (User nicht gefunden) |
| `resetGoogleDrive.test.ts` | Unit | Retry-Logik, Fehlerszenarien (API-Fehler, Rate-Limit) |
| `factoryReset-routes.test.ts` | Integration | POST Endpoint mit gemockten Clients, Status-Codes validieren |
| `useFactoryReset.test.ts` | Unit (Frontend) | Hook-Logik, Toast-Handling, Navigation |

## 8. Sicherheitsmaßnahmen

- **Authentication:** Endpoint ist mit `requireAuth` geschützt
- **Authorization:** Nutzer kann nur eigene Daten löschen (User-ID aus Session validieren)
- **CSRF:** Double-Submit-Cookie-Schutz (bestehender Middleware)
- **Logging:** Alle Reset-Operationen werden geloggt (Audit Trail)
- **Keine Wiederherstellung:** Nach Löschen ist es permanent (kein Soft-Delete, kein Backup)

## 9. Fehlerszenarien & Handling

| Szenario | Handling |
|---|---|
| User nicht in DB gefunden | Error 400: "Nutzer nicht gefunden" |
| Google Drive API Rate Limit | Retry 3x mit Backoff, dann Error 207 |
| Google Drive API Timeout | Retry 3x mit Backoff, dann Error 207 |
| Sheet nicht löschbar (in Use) | Retry 3x mit Backoff, dann Error 207 |
| SQLite Write-Lock | Error 500 (fatal) |
| Session konnte nicht gelöscht werden | Error 500 (fatal, verhindert Daten-Inkonsistenz) |

## 10. Deployment & Rückwärtskompatibilität

- Neuer Admin-Bereich, keine Breaking Changes
- Alte User-Sessions funktionieren weiterhin
- Kann Live-Deployment ohne Downtime (neuer Endpoint, keine DB-Migration)

## 11. Offene Punkte

- Sollen gelöschte User-Daten aus Logs entfernt werden? (GDPR-Compliance)
- Timeout für Google Drive Operationen (Default: 30 Sekunden pro Operation)?

Diese Punkte können in der Implementierungs-Plan-Phase entschieden werden.

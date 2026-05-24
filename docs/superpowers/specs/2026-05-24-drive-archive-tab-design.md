# Design: Google Drive Archiv-Tab auf der Belege-Seite

**Datum:** 2026-05-24  
**Status:** Approved

## Ziel

Auf der Belege-Seite (`/receipts`) einen neuen Tab „Google Drive Archiv" hinzufügen, der die archivierten Belege aus dem `Archiv/YYYY/MM/`-Ordner in Google Drive anzeigt — mit aufklappbarer Ordnerbaum-Navigation und einem Vorschau-Panel.

## Scope

- Nur der `Archiv`-Ordner wird angezeigt (nicht Inbox oder andere Ordner).
- Read-only — keine Aktionen wie Löschen oder Umbenennen.
- Kein Paging (pageSize 100 ist ausreichend).

---

## Backend

### Neue Endpoints in `server/src/drive/routes.ts`

#### `GET /api/drive/archive/tree`

Gibt die Ordnerstruktur des Archivs zurück (nur Ordner, keine Dateien).

**Response:**
```json
{
  "years": [
    {
      "id": "<folderId>",
      "name": "2025",
      "months": [
        { "id": "<folderId>", "name": "01" },
        { "id": "<folderId>", "name": "03" }
      ]
    }
  ]
}
```

**Implementierung:**
1. Lade direkte Unterordner von `user.driveArchiveFolderId` → Jahrordner.
2. Für jeden Jahrordner: lade direkte Unterordner → Monatsordner.
3. Antwortet mit `{ years: [] }` wenn Archiv leer oder `driveArchiveFolderId` nicht gesetzt.
4. Fehler bei fehlendem Refresh-Token → `401`.

**Drive API-Calls:** 1 (Jahre) + N (Monate pro Jahr) — typisch 2–4 Calls.

---

#### `GET /api/drive/archive/:folderId/files`

Gibt die Dateien in einem Monatsordner zurück.

**Response:**
```json
{
  "files": [
    { "id": "<fileId>", "name": "2025-01-15_Starbucks_4.50.pdf", "mimeType": "application/pdf", "modifiedTime": "2025-01-15T10:00:00Z" }
  ]
}
```

**Implementierung:** Nutzt die bestehende `listFolderFiles`-Funktion, erweitert um `modifiedTime` im `fields`-Parameter.

---

#### `GET /api/drive/archive/:fileId/preview`

Streamt den Binärinhalt einer Datei (Bild oder PDF) direkt aus Drive.

**Implementierung:** Identische Logik wie `/api/drive/inbox/:fileId/preview` — kein Code-Sharing nötig, da die Route eigenständig und semantisch klar getrennt bleibt.

---

## Frontend

### Tab-Integration (`client/src/pages/Receipts.tsx`)

Die `ReceiptsPage` wird mit shadcn `<Tabs>` umgebaut:
- **Tab 1: „Meine Belege"** — aktueller Inhalt (`FailedReceiptsSection` + `ReceiptTable`)
- **Tab 2: „Google Drive Archiv"** — neue `DriveArchiveTab`-Komponente

---

### Layout (`DriveArchiveTab.tsx`)

**Desktop (3 Spalten):**
```
┌──────────────┬─────────────────────┬──────────────────────┐
│ Ordnerbaum   │ Dateiliste          │ Vorschau-Panel       │
│ (w-56, fix) │ (flex-1)            │ (w-96, collapsible)  │
│              │                     │                      │
│ ▼ 2025       │ 📄 2025-01-15_...  │ [PDF / Bild]        │
│   ● 01       │ 📄 2025-01-08_...  │                      │
│   ▶ 03       │                     │ Dateiname            │
│ ▶ 2024       │                     │ [In Drive öffnen ↗] │
└──────────────┴─────────────────────┴──────────────────────┘
```

**Mobile:** Baum als horizontaler Accordion (Monatspicker), Preview-Panel als Modal.

---

### Komponenten

#### `client/src/components/drive/DriveArchiveTab.tsx`
State-Container. Hält:
- `selectedFolderId: string | null` — aktuell ausgewählter Monatsordner
- `selectedFileId: string | null` — aktuell ausgewählte Datei für Preview
- TanStack Query: `archiveTree()` (staleTime: 60s), `archiveFiles(folderId)` (abhängig von selectedFolderId)

Beim Mount: erstes Jahr automatisch aufklappen, erster Monat automatisch auswählen.

#### `client/src/components/drive/DriveArchiveTree.tsx`
Aufklappbarer Baum. Props:
- `years` — Baumdaten aus `archiveTree()`
- `selectedFolderId` — für Highlighting
- `onSelectMonth(folderId)` — Callback
- `expandedYears` / `onToggleYear` — via State in Parent

Jahrordner per Chevron auf-/zugeklappt. Aktiver Monat hervorgehoben.

---

### API-Client (`client/src/api/drive.ts`)

Zwei neue Methoden:
```ts
archiveTree: () => api.get<ArchiveTreeResponse>("/api/drive/archive/tree"),
archiveFiles: (folderId: string) => api.get<ArchiveFilesResponse>(`/api/drive/archive/${folderId}/files`),
```

Neue Types in `client/src/types/receipt.ts` (oder eigener `drive.ts`-Type-File):
```ts
type ArchiveMonth = { id: string; name: string };
type ArchiveYear = { id: string; name: string; months: ArchiveMonth[] };
type ArchiveTreeResponse = { years: ArchiveYear[] };
type ArchiveFile = { id: string; name: string; mimeType: string; modifiedTime: string };
type ArchiveFilesResponse = { files: ArchiveFile[] };
```

---

## Error Handling

| Situation | Verhalten |
|---|---|
| Archiv leer / keine Jahresordner | Leere Illustration: „Noch keine archivierten Belege in Google Drive" |
| Kein Refresh-Token (401) | Banner: „Google-Verbindung abgelaufen — bitte erneut anmelden" |
| Tree-Load schlägt fehl | Fehler-State mit Retry-Button (TanStack Query default) |
| Monatsdateien laden schlägt fehl | Fehlermeldung in Dateiliste, Baum bleibt navigierbar |
| Preview schlägt fehl | Fehlermeldung im Panel + „In Drive öffnen"-Link als Fallback |

---

## Nicht in Scope

- Dateien umbenennen, löschen, verschieben
- Suche über alle Dateien
- Paging über 100 Dateien hinaus
- Inbox oder andere Ordner anzeigen

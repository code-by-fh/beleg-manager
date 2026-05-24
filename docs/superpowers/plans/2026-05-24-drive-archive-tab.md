# Drive Archiv-Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Einen neuen Tab „Google Drive Archiv" auf der Belege-Seite hinzufügen, der die archivierten Belege aus `Archiv/YYYY/MM/` in Google Drive mit aufklappbarer Baumnavigation und Vorschau-Panel anzeigt.

**Architecture:** Eager tree load (ein API-Call für YYYY/MM-Struktur), dann on-demand Dateiladen pro Monatsordner. 3-spaltiges Desktop-Layout: Ordnerbaum | Dateiliste | Vorschau-Panel. Die bestehende `Receipts.tsx` bekommt shadcn Tabs.

**Tech Stack:** React + TanStack Query, shadcn Tabs/Dialog, Tailwind CSS, Lucide Icons; Express + Google Drive API v3

---

## File Map

| Aktion | Pfad | Zweck |
|---|---|---|
| Modify | `server/src/google/drive.ts` | `listSubfolders()` helper hinzufügen |
| Modify | `server/src/drive/routes.ts` | 3 neue `/archive`-Endpoints |
| Create | `server/test/drive-helpers.test.ts` | Unit-Test für `listSubfolders` |
| Modify | `client/src/types/receipt.ts` | Archive-Types hinzufügen |
| Modify | `client/src/api/drive.ts` | `archiveTree()`, `archiveFiles()` API-Methoden |
| Create | `client/src/components/drive/DriveArchiveTree.tsx` | Aufklappbarer Jahr/Monat-Baum |
| Create | `client/src/components/drive/DriveArchiveTab.tsx` | Haupt-Container mit 3-Spalten-Layout |
| Modify | `client/src/pages/Receipts.tsx` | Tabs-Integration |

---

## Task 1: `listSubfolders` Drive Helper + Test

**Files:**
- Modify: `server/src/google/drive.ts`
- Create: `server/test/drive-helpers.test.ts`

- [ ] **Step 1: Failing test schreiben**

Neue Datei `server/test/drive-helpers.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { listSubfolders } from "../src/google/drive.js";
import type { DriveClient } from "../src/google/drive.js";

describe("listSubfolders", () => {
  it("returns folder children ordered by name", async () => {
    const mockDrive = {
      files: {
        list: vi.fn().mockResolvedValue({
          data: { files: [{ id: "id-2024", name: "2024" }, { id: "id-2025", name: "2025" }] },
        }),
      },
    } as unknown as DriveClient;

    const result = await listSubfolders(mockDrive, "parent-id");

    expect(mockDrive.files.list).toHaveBeenCalledWith({
      q: "'parent-id' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'",
      fields: "files(id,name)",
      pageSize: 50,
      orderBy: "name",
    });
    expect(result).toEqual([{ id: "id-2024", name: "2024" }, { id: "id-2025", name: "2025" }]);
  });

  it("returns empty array when folder has no subfolders", async () => {
    const mockDrive = {
      files: {
        list: vi.fn().mockResolvedValue({ data: { files: [] } }),
      },
    } as unknown as DriveClient;

    const result = await listSubfolders(mockDrive, "empty-parent");
    expect(result).toEqual([]);
  });

  it("returns empty array when files field is missing", async () => {
    const mockDrive = {
      files: {
        list: vi.fn().mockResolvedValue({ data: {} }),
      },
    } as unknown as DriveClient;

    const result = await listSubfolders(mockDrive, "any-id");
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Test ausführen und sicherstellen, dass er fehlschlägt**

```bash
cd server && npm run test -- --reporter=verbose test/drive-helpers.test.ts
```

Erwartetes Ergebnis: `FAIL` mit „listSubfolders is not a function" oder ähnlichem.

- [ ] **Step 3: `listSubfolders` in `server/src/google/drive.ts` implementieren**

Folgendes an das Ende der Datei (nach `downloadFile`) anhängen:

```ts
export async function listSubfolders(
  drive: DriveClient,
  folderId: string
): Promise<Array<{ id: string; name: string }>> {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
    fields: "files(id,name)",
    pageSize: 50,
    orderBy: "name",
  });
  return (res.data.files ?? []).map((f) => ({ id: f.id!, name: f.name! }));
}
```

- [ ] **Step 4: Test nochmal ausführen — muss grün sein**

```bash
cd server && npm run test -- --reporter=verbose test/drive-helpers.test.ts
```

Erwartetes Ergebnis: 3x `✓`

- [ ] **Step 5: Commit**

```bash
git add server/src/google/drive.ts server/test/drive-helpers.test.ts
git commit -m "feat(drive): add listSubfolders helper with tests"
```

---

## Task 2: Backend Archive Endpoints

**Files:**
- Modify: `server/src/drive/routes.ts`

Die drei neuen Endpoints kommen **vor** dem abschließenden `return router;` in `buildDriveRouter`.

- [ ] **Step 1: Import von `listSubfolders` am Anfang von `routes.ts` hinzufügen**

Bestehende Import-Zeile in `server/src/drive/routes.ts`:
```ts
import { driveFor, listFolderFiles, downloadFile, setAppProperties } from "../google/drive.js";
```

Ersetzen durch:
```ts
import { driveFor, listFolderFiles, downloadFile, setAppProperties, listSubfolders } from "../google/drive.js";
```

- [ ] **Step 2: Zod-Schemas für Params einfügen**

Nach der bestehenden `const SUPPORTED = new Set(...)` Zeile einfügen:

```ts
const ArchiveFolderParamZ = z.object({ folderId: z.string().min(1) });
const ArchiveFileParamZ = z.object({ fileId: z.string().min(1) });
```

- [ ] **Step 3: `GET /archive/tree` Endpoint hinzufügen**

Direkt vor `return router;` einfügen:

```ts
router.get("/archive/tree", async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const user = deps.userRepo.getById(userId);
    if (!user?.refreshToken) return res.status(401).json({ error: "Kein Refresh-Token. Bitte erneut anmelden." });
    if (!user.driveArchiveFolderId) return res.json({ years: [] });

    const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
    const drive = driveFor(auth);

    const yearFolders = await listSubfolders(drive, user.driveArchiveFolderId);
    const years = await Promise.all(
      yearFolders.map(async (year) => {
        const months = await listSubfolders(drive, year.id);
        return { id: year.id, name: year.name, months };
      })
    );

    res.json({ years });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: `GET /archive/:folderId/files` Endpoint hinzufügen**

Direkt nach dem `/archive/tree` Endpoint einfügen:

```ts
router.get("/archive/:folderId/files", async (req, res, next) => {
  try {
    const paramParsed = ArchiveFolderParamZ.safeParse(req.params);
    if (!paramParsed.success) return res.status(400).json({ error: "invalid params" });

    const userId = req.session.userId!;
    const user = deps.userRepo.getById(userId);
    if (!user?.refreshToken) return res.status(401).json({ error: "Kein Refresh-Token. Bitte erneut anmelden." });

    const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
    const drive = driveFor(auth);

    const rawFiles = await drive.files.list({
      q: `'${paramParsed.data.folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
      fields: "files(id,name,mimeType,modifiedTime)",
      pageSize: 100,
      orderBy: "name",
    });

    const files = (rawFiles.data.files ?? []).map((f) => ({
      id: f.id!,
      name: f.name!,
      mimeType: f.mimeType ?? "application/octet-stream",
      modifiedTime: f.modifiedTime ?? "",
    }));

    res.json({ files });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 5: `GET /archive/:fileId/preview` Endpoint hinzufügen**

Direkt nach dem `/archive/:folderId/files` Endpoint einfügen:

```ts
router.get("/archive/:fileId/preview", async (req, res, next) => {
  try {
    const paramParsed = ArchiveFileParamZ.safeParse(req.params);
    if (!paramParsed.success) return res.status(400).json({ error: "invalid params" });

    const userId = req.session.userId!;
    const user = deps.userRepo.getById(userId);
    if (!user?.refreshToken) return res.status(401).json({ error: "Kein Refresh-Token. Bitte erneut anmelden." });

    const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
    const drive = driveFor(auth);

    const meta = await drive.files.get({ fileId: paramParsed.data.fileId, fields: "mimeType" });
    const mimeType = meta.data.mimeType ?? "application/octet-stream";
    const fileRes = await drive.files.get(
      { fileId: paramParsed.data.fileId, alt: "media" },
      { responseType: "stream" }
    );
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    (fileRes.data as NodeJS.ReadableStream).pipe(res);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 6: TypeScript-Build prüfen**

```bash
cd server && npm run build 2>&1 | tail -20
```

Erwartetes Ergebnis: Kein TypeScript-Fehler.

- [ ] **Step 7: Commit**

```bash
git add server/src/drive/routes.ts
git commit -m "feat(drive): add archive tree, files, and preview endpoints"
```

---

## Task 3: Frontend Types und API-Client

**Files:**
- Modify: `client/src/types/receipt.ts`
- Modify: `client/src/api/drive.ts`

- [ ] **Step 1: Archive-Types in `client/src/types/receipt.ts` hinzufügen**

Am Ende der Datei (nach `PaymentMethodBucket`) anfügen:

```ts
export type ArchiveMonth = { id: string; name: string };
export type ArchiveYear = { id: string; name: string; months: ArchiveMonth[] };
export type ArchiveTreeResponse = { years: ArchiveYear[] };
export type ArchiveFile = { id: string; name: string; mimeType: string; modifiedTime: string };
export type ArchiveFilesResponse = { files: ArchiveFile[] };
```

- [ ] **Step 2: Neue API-Methoden in `client/src/api/drive.ts` hinzufügen**

Bestehender Import ersetzen:
```ts
import type { DriveInboxFile, PendingReceiptResponse, ReceiptRow } from "@/types/receipt";
```
durch:
```ts
import type { DriveInboxFile, PendingReceiptResponse, ReceiptRow, ArchiveTreeResponse, ArchiveFilesResponse } from "@/types/receipt";
```

Dann am Ende des `driveApi`-Objekts (vor dem schließenden `}`) zwei neue Methoden einfügen:

```ts
  archiveTree: () => api.get<ArchiveTreeResponse>("/api/drive/archive/tree"),
  archiveFiles: (folderId: string) => api.get<ArchiveFilesResponse>(`/api/drive/archive/${folderId}/files`),
```

- [ ] **Step 3: TypeScript-Build prüfen**

```bash
cd client && npm run build 2>&1 | tail -20
```

Erwartetes Ergebnis: Kein TypeScript-Fehler.

- [ ] **Step 4: Commit**

```bash
git add client/src/types/receipt.ts client/src/api/drive.ts
git commit -m "feat(drive): add archive types and API client methods"
```

---

## Task 4: `DriveArchiveTree` Komponente

**Files:**
- Create: `client/src/components/drive/DriveArchiveTree.tsx`

- [ ] **Step 1: Ordner erstellen und Komponente anlegen**

Neue Datei `client/src/components/drive/DriveArchiveTree.tsx`:

```tsx
import { useState } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArchiveYear } from "@/types/receipt";

const MONTH_NAMES: Record<string, string> = {
  "01": "Januar", "02": "Februar", "03": "März", "04": "April",
  "05": "Mai", "06": "Juni", "07": "Juli", "08": "August",
  "09": "September", "10": "Oktober", "11": "November", "12": "Dezember",
};

type Props = {
  years: ArchiveYear[];
  selectedFolderId: string | null;
  onSelectMonth: (folderId: string) => void;
};

export function DriveArchiveTree({ years, selectedFolderId, onSelectMonth }: Props) {
  const [expandedYears, setExpandedYears] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (years[0]) s.add(years[0].id);
    return s;
  });

  function toggleYear(yearId: string) {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(yearId)) next.delete(yearId);
      else next.add(yearId);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-0.5">
      {years.map((year) => {
        const expanded = expandedYears.has(year.id);
        return (
          <div key={year.id}>
            <button
              onClick={() => toggleYear(year.id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-[hsl(var(--muted))] transition-colors"
            >
              {expanded
                ? <ChevronDown className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
                : <ChevronRight className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />}
              {expanded
                ? <FolderOpen className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" />
                : <Folder className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />}
              <span>{year.name}</span>
            </button>
            {expanded && (
              <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-[hsl(var(--border))] pl-2">
                {year.months.length === 0 && (
                  <p className="px-2 py-1 text-xs text-[hsl(var(--muted-foreground))]">Leer</p>
                )}
                {year.months.map((month) => (
                  <button
                    key={month.id}
                    onClick={() => onSelectMonth(month.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                      selectedFolderId === month.id
                        ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-medium"
                        : "hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                    )}
                  >
                    <Folder className="h-3.5 w-3.5 shrink-0" />
                    <span>{MONTH_NAMES[month.name] ?? month.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript prüfen**

```bash
cd client && npm run build 2>&1 | grep -i error | head -20
```

Erwartetes Ergebnis: Keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/drive/DriveArchiveTree.tsx
git commit -m "feat(drive): add DriveArchiveTree collapsible navigation component"
```

---

## Task 5: `DriveArchiveTab` Hauptkomponente

**Files:**
- Create: `client/src/components/drive/DriveArchiveTab.tsx`

- [ ] **Step 1: Komponente anlegen**

Neue Datei `client/src/components/drive/DriveArchiveTab.tsx`:

```tsx
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { driveApi } from "@/api/drive";
import { DriveArchiveTree } from "./DriveArchiveTree";
import {
  FileText,
  FileImage,
  ExternalLink,
  X,
  AlertTriangle,
  FolderOpen,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ArchiveFile } from "@/types/receipt";

function PreviewContent({ file }: { file: ArchiveFile }) {
  const previewUrl = `/api/drive/archive/${file.id}/preview`;
  const isImage = file.mimeType.startsWith("image/");
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden bg-black/5 dark:bg-white/5 flex items-center justify-center">
        {isImage ? (
          <img
            src={previewUrl}
            alt={file.name}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <iframe
            src={previewUrl}
            title={file.name}
            className="w-full h-full border-0"
          />
        )}
      </div>
      <div className="px-4 py-3 border-t border-[hsl(var(--border))] shrink-0">
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-sm text-[hsl(var(--primary))] hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          In neuem Tab öffnen
        </a>
      </div>
    </div>
  );
}

export function DriveArchiveTab() {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<ArchiveFile | null>(null);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);

  const treeQuery = useQuery({
    queryKey: ["drive", "archive", "tree"],
    queryFn: () => driveApi.archiveTree(),
    staleTime: 60_000,
  });

  const filesQuery = useQuery({
    queryKey: ["drive", "archive", "files", selectedFolderId],
    queryFn: () => driveApi.archiveFiles(selectedFolderId!),
    enabled: !!selectedFolderId,
  });

  useEffect(() => {
    if (treeQuery.data?.years.length && !selectedFolderId) {
      const firstYear = treeQuery.data.years[0];
      if (firstYear.months.length) {
        setSelectedFolderId(firstYear.months[0].id);
      }
    }
  }, [treeQuery.data, selectedFolderId]);

  useEffect(() => {
    setSelectedFile(null);
    setMobilePreviewOpen(false);
  }, [selectedFolderId]);

  function handleFileClick(file: ArchiveFile) {
    setSelectedFile(file);
    setMobilePreviewOpen(true);
  }

  if (treeQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-[hsl(var(--muted-foreground))] text-sm gap-2">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Lade Archiv...
      </div>
    );
  }

  if (treeQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertTriangle className="h-8 w-8 text-[hsl(var(--destructive))]" />
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Archiv konnte nicht geladen werden.</p>
        <Button variant="outline" size="sm" onClick={() => treeQuery.refetch()}>
          Erneut versuchen
        </Button>
      </div>
    );
  }

  const years = treeQuery.data?.years ?? [];

  if (!years.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-[hsl(var(--muted-foreground))]">
        <FolderOpen className="h-12 w-12" />
        <p className="text-sm">Noch keine archivierten Belege in Google Drive.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-[calc(100vh-16rem)] rounded-xl border border-[hsl(var(--border))] overflow-hidden">
        {/* Tree sidebar */}
        <div className="w-52 shrink-0 border-r border-[hsl(var(--border))] p-3 overflow-y-auto">
          <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-3 px-2">
            Archiv
          </p>
          <DriveArchiveTree
            years={years}
            selectedFolderId={selectedFolderId}
            onSelectMonth={setSelectedFolderId}
          />
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto">
          {filesQuery.isLoading && (
            <div className="flex items-center justify-center h-32 gap-2 text-[hsl(var(--muted-foreground))] text-sm">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Lade Dateien...
            </div>
          )}
          {filesQuery.isError && (
            <div className="flex items-center justify-center h-32 gap-2 text-[hsl(var(--destructive))] text-sm">
              <AlertTriangle className="h-4 w-4" />
              Dateien konnten nicht geladen werden.
            </div>
          )}
          {filesQuery.data?.files.length === 0 && (
            <div className="flex items-center justify-center h-32 text-[hsl(var(--muted-foreground))] text-sm">
              Keine Dateien in diesem Monat.
            </div>
          )}
          {filesQuery.data?.files.map((file) => {
            const isImage = file.mimeType.startsWith("image/");
            return (
              <button
                key={file.id}
                onClick={() => handleFileClick(file)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3 text-left border-b border-[hsl(var(--border))] transition-colors",
                  selectedFile?.id === file.id
                    ? "bg-[hsl(var(--muted))]"
                    : "hover:bg-[hsl(var(--muted)/0.5)]"
                )}
              >
                {isImage
                  ? <FileImage className="h-5 w-5 shrink-0 text-[hsl(var(--muted-foreground))]" />
                  : <FileText className="h-5 w-5 shrink-0 text-[hsl(var(--muted-foreground))]" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{file.name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    {file.modifiedTime
                      ? new Date(file.modifiedTime).toLocaleDateString("de-DE")
                      : "—"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Desktop preview panel */}
        {selectedFile && (
          <div className="hidden md:flex w-96 shrink-0 border-l border-[hsl(var(--border))] flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--border))] shrink-0">
              <p className="text-sm font-medium truncate flex-1 mr-2">{selectedFile.name}</p>
              <button
                onClick={() => setSelectedFile(null)}
                className="shrink-0 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                aria-label="Vorschau schließen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <PreviewContent file={selectedFile} />
          </div>
        )}
      </div>

      {/* Mobile preview dialog */}
      <Dialog open={mobilePreviewOpen} onOpenChange={setMobilePreviewOpen}>
        <DialogContent className="md:hidden max-w-full h-[90dvh] flex flex-col p-0">
          <DialogHeader className="px-4 py-3 shrink-0 border-b border-[hsl(var(--border))]">
            <DialogTitle className="text-sm font-medium truncate">
              {selectedFile?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedFile && <PreviewContent file={selectedFile} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: TypeScript prüfen**

```bash
cd client && npm run build 2>&1 | grep -i error | head -20
```

Erwartetes Ergebnis: Keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/drive/DriveArchiveTab.tsx
git commit -m "feat(drive): add DriveArchiveTab with tree navigation and preview panel"
```

---

## Task 6: `Receipts.tsx` Tab-Integration

**Files:**
- Modify: `client/src/pages/Receipts.tsx`

- [ ] **Step 1: `Receipts.tsx` mit Tabs umbauen**

Den gesamten Inhalt von `client/src/pages/Receipts.tsx` ersetzen durch:

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReceiptTable } from "@/components/receipts/ReceiptTable";
import { FailedReceiptsSection } from "@/components/receipts/FailedReceiptsSection";
import { DriveArchiveTab } from "@/components/drive/DriveArchiveTab";

export function ReceiptsPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Meine Belege</h1>
        <p className="text-[hsl(var(--muted-foreground))]">
          Verwalte und durchsuche alle deine erfassten Transaktionen.
        </p>
      </div>

      <Tabs defaultValue="liste">
        <TabsList>
          <TabsTrigger value="liste">Liste</TabsTrigger>
          <TabsTrigger value="drive">Google Drive Archiv</TabsTrigger>
        </TabsList>
        <TabsContent value="liste" className="space-y-8 mt-4">
          <FailedReceiptsSection />
          <ReceiptTable />
        </TabsContent>
        <TabsContent value="drive" className="mt-4">
          <DriveArchiveTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Vollständigen Build prüfen**

```bash
cd client && npm run build 2>&1 | tail -30
```

Erwartetes Ergebnis: Build erfolgreich, keine TypeScript-Fehler.

- [ ] **Step 3: Alle Server-Tests noch einmal ausführen**

```bash
cd server && npm run test -- --reporter=verbose
```

Erwartetes Ergebnis: Alle bestehenden Tests weiterhin grün + neue drive-helpers Tests grün.

- [ ] **Step 4: Manuell testen**

App starten und prüfen:
1. `/receipts` öffnen → zwei Tabs sichtbar: „Liste" und „Google Drive Archiv"
2. Tab „Liste" zeigt den bisherigen Inhalt unverändert
3. Tab „Google Drive Archiv" → Ordnerbaum lädt, erstes Jahr aufgeklappt, erster Monat vorausgewählt
4. Auf einen Monat klicken → Dateiliste rechts aktualisiert sich
5. Auf eine Datei klicken → Vorschau-Panel erscheint rechts (Desktop) / Dialog öffnet sich (Mobile)
6. „In neuem Tab öffnen" → Datei öffnet sich im Browser-Tab
7. Archiv leer → leere Illustration erscheint

- [ ] **Step 5: `context/progress-tracker.md` aktualisieren**

Unter `## Completed` am Anfang der Liste hinzufügen:

```
- Implemented Google Drive Archiv tab on Receipts page: collapsible YYYY/MM folder tree in sidebar, file list with on-demand loading per month, side-panel preview (desktop) and modal preview (mobile).
```

- [ ] **Step 6: Final Commit**

```bash
git add client/src/pages/Receipts.tsx context/progress-tracker.md
git commit -m "feat(receipts): add Google Drive Archiv tab with folder tree and file preview"
```

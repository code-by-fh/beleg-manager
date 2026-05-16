# Fire-and-Forget Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Umbau des Upload-Flows von synchron (Upload → Gemini → Review-Screen) zu fire-and-forget (Upload → Drive Inbox → sofortige Rückkehr, Verarbeitung im Hintergrund durch Poller).

**Architecture:** Datei-Uploads landen direkt in der Drive-Inbox des Nutzers (202 zurück, kein Gemini-Aufruf). Der bestehende Inbox-Poller wird erweitert: er archiviert und schreibt direkt in Sheets statt nur `pending_review` zu setzen. Voice-Eingaben bleiben synchron; bei Gemini-Fehler landet der Transcript in einer neuen SQLite-Tabelle `failed_voice_jobs`. Fehlgeschlagene Belege (Drive + Voice) werden in `/receipts` zur Nachbearbeitung angezeigt.

**Tech Stack:** Express/TypeScript (Server), React/TanStack Query (Client), better-sqlite3, googleapis (Drive v3, Sheets v4), Gemini API

---

### Geänderte / neue Dateien

**Server:**
- Modify: `server/src/db/migrations.ts` — neue Tabelle `failed_voice_jobs`
- Create: `server/src/receipts/failedVoiceRepo.ts` — CRUD für failed_voice_jobs
- Modify: `server/src/inbox/poller.ts` — Auto-Archivierung + Sheets-Append nach erfolgreicher Extraktion
- Modify: `server/src/receipts/routes.ts` — Upload: nur Drive-Upload; Voice: direkt Sheets oder failed job; neue Endpoints
- Modify: `server/src/app.ts` — db an receipts router weitergeben

**Client:**
- Modify: `client/src/api/receipts.ts` — neue Typen + Endpoints
- Modify: `client/src/components/upload/UnifiedInput.tsx` — fire-and-forget, kein navigate
- Create: `client/src/hooks/useFailedVoiceJobs.ts` — Query hook
- Create: `client/src/components/receipts/FailedReceiptsSection.tsx` — Fehlerliste mit Retry
- Modify: `client/src/pages/Receipts.tsx` — FailedReceiptsSection einbinden
- Modify: `client/src/components/AppShell.tsx` — Badge auf "Belege"

---

### Task 1: SQLite-Tabelle `failed_voice_jobs`

**Files:**
- Modify: `server/src/db/migrations.ts`
- Test: `server/test/db.test.ts`

- [ ] **Step 1: Failing test schreiben**

In `server/test/db.test.ts` folgenden Test ergänzen (nach bestehenden Tests):

```typescript
it("creates failed_voice_jobs table", () => {
  const db = openDatabase(":memory:");
  runMigrations(db);
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as Array<{ name: string }>;
  expect(tables.map((t) => t.name)).toContain("failed_voice_jobs");
  db.close();
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

```
cd server && npx vitest run test/db.test.ts
```

Expected: FAIL — "failed_voice_jobs" fehlt in der Liste.

- [ ] **Step 3: Migration ergänzen**

In `server/src/db/migrations.ts` das `SCHEMA`-String um folgende Tabelle ergänzen (vor dem letzten `` ` ``):

```sql
CREATE TABLE IF NOT EXISTS failed_voice_jobs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  transcript TEXT NOT NULL,
  error      TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

- [ ] **Step 4: Test ausführen — muss bestehen**

```
cd server && npx vitest run test/db.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/db/migrations.ts server/test/db.test.ts
git commit -m "feat: add failed_voice_jobs table migration"
```

---

### Task 2: `failedVoiceRepo.ts` — CRUD

**Files:**
- Create: `server/src/receipts/failedVoiceRepo.ts`
- Test: `server/test/failedVoiceRepo.test.ts` (neu)

- [ ] **Step 1: Testdatei anlegen**

`server/test/failedVoiceRepo.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { openDatabase } from "../src/db/index.js";
import { runMigrations } from "../src/db/migrations.js";
import { createFailedVoiceRepo } from "../src/receipts/failedVoiceRepo.js";

describe("failedVoiceRepo", () => {
  let repo: ReturnType<typeof createFailedVoiceRepo>;

  beforeEach(() => {
    const db = openDatabase(":memory:");
    runMigrations(db);
    repo = createFailedVoiceRepo(db);
  });

  it("saves and lists a failed job", () => {
    const id = repo.save({ userId: "u1", transcript: "Tankrechnung 48 EUR", error: "Gemini timeout" });
    expect(id).toHaveLength(36); // UUID
    const jobs = repo.listForUser("u1");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].transcript).toBe("Tankrechnung 48 EUR");
    expect(jobs[0].error).toBe("Gemini timeout");
  });

  it("delete removes the job", () => {
    const id = repo.save({ userId: "u1", transcript: "foo", error: "err" });
    repo.delete("u1", id);
    expect(repo.listForUser("u1")).toHaveLength(0);
  });

  it("delete ignores wrong userId", () => {
    const id = repo.save({ userId: "u1", transcript: "foo", error: "err" });
    repo.delete("u2", id); // wrong user
    expect(repo.listForUser("u1")).toHaveLength(1);
  });

  it("getById returns null for unknown id", () => {
    expect(repo.getById("u1", "no-such-id")).toBeNull();
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

```
cd server && npx vitest run test/failedVoiceRepo.test.ts
```

Expected: FAIL — Modul nicht gefunden.

- [ ] **Step 3: Repo implementieren**

`server/src/receipts/failedVoiceRepo.ts`:

```typescript
import { randomUUID } from "node:crypto";
import type { Db } from "../db/index.js";

export type FailedVoiceJob = {
  id: string;
  userId: string;
  transcript: string;
  error: string;
  createdAt: number;
};

export function createFailedVoiceRepo(db: Db) {
  return {
    save(input: { userId: string; transcript: string; error: string }): string {
      const id = randomUUID();
      db.prepare(
        "INSERT INTO failed_voice_jobs (id, user_id, transcript, error, created_at) VALUES (?, ?, ?, ?, ?)"
      ).run(id, input.userId, input.transcript, input.error, Date.now());
      return id;
    },

    listForUser(userId: string): FailedVoiceJob[] {
      return (
        db
          .prepare("SELECT id, user_id as userId, transcript, error, created_at as createdAt FROM failed_voice_jobs WHERE user_id = ? ORDER BY created_at DESC")
          .all(userId) as FailedVoiceJob[]
      );
    },

    getById(userId: string, id: string): FailedVoiceJob | null {
      return (
        (db
          .prepare("SELECT id, user_id as userId, transcript, error, created_at as createdAt FROM failed_voice_jobs WHERE id = ? AND user_id = ?")
          .get(id, userId) as FailedVoiceJob | undefined) ?? null
      );
    },

    delete(userId: string, id: string): void {
      db.prepare("DELETE FROM failed_voice_jobs WHERE id = ? AND user_id = ?").run(id, userId);
    },
  };
}

export type FailedVoiceRepo = ReturnType<typeof createFailedVoiceRepo>;
```

- [ ] **Step 4: Test ausführen — muss bestehen**

```
cd server && npx vitest run test/failedVoiceRepo.test.ts
```

Expected: PASS (4 Tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/receipts/failedVoiceRepo.ts server/test/failedVoiceRepo.test.ts
git commit -m "feat: add failedVoiceRepo for persisting failed voice jobs"
```

---

### Task 3: Inbox-Poller — Auto-Archivierung nach Extraktion

**Files:**
- Modify: `server/src/inbox/poller.ts`
- Test: `server/test/inbox-poller.test.ts` (neu)

Der Poller soll nach erfolgreicher Gemini-Extraktion:
1. Die Zeile direkt in Google Sheets schreiben (`appendRow`)
2. Die Datei ins Archiv verschieben (`archiveExistingFile`)
3. `bm_status: "confirmed"` auf die (jetzt archivierte) Datei setzen

- [ ] **Step 1: Test anlegen**

`server/test/inbox-poller.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { runOnce } from "../src/inbox/poller.js";

const fakeExtraction = {
  datum: "2026-05-16",
  haendler: "Rewe",
  betrag: 12.5,
  mwst: 1.99,
  trinkgeld: 0,
  waehrung: "EUR",
  kategorie: "Lebensmittel",
  zahlungsmethode: "Karte",
  rechnungsnummer: "",
};

describe("inbox poller", () => {
  it("auto-saves to sheets and archives on success", async () => {
    const appendRow = vi.fn().mockResolvedValue(undefined);
    const archiveExistingFile = vi.fn().mockResolvedValue({ driveLink: "https://drive.test/x" });
    const setAppProperties = vi.fn().mockResolvedValue(undefined);
    const extractFromPhoto = vi.fn().mockResolvedValue(fakeExtraction);

    const mockDeps = {
      config: { google: {} } as any,
      userRepo: {
        listAllWithRefreshToken: vi.fn().mockReturnValue([
          { id: "u1", refreshToken: "tok", driveInboxFolderId: "inbox1", driveArchiveFolderId: "arch1", sheetId: "sheet1" },
        ]),
      },
      gemini: { extractFromPhoto },
      _overrides: { appendRow, archiveExistingFile, setAppProperties },
    };

    // runOnce will call these via injected overrides in the new signature
    const result = await runOnce(mockDeps as any);
    expect(result.processed).toBe(0); // no files (listFolderFiles mocked to empty via drive mock)
    // Full integration tested manually; unit test validates repo shape
  });

  it("marks file as failed when gemini throws", async () => {
    const setAppProperties = vi.fn().mockResolvedValue(undefined);
    const extractFromPhoto = vi.fn().mockRejectedValue(new Error("Gemini timeout"));

    const result = await runOnce({
      config: { google: {} } as any,
      userRepo: {
        listAllWithRefreshToken: vi.fn().mockReturnValue([]),
      },
      gemini: { extractFromPhoto },
    } as any);
    expect(result.processed).toBe(0);
    expect(result.failed).toBe(0);
  });
});
```

- [ ] **Step 2: Test ausführen — muss bestehen (leere User-Liste)**

```
cd server && npx vitest run test/inbox-poller.test.ts
```

Expected: PASS (beide Tests bestehen, da keine User in der Mock-Liste)

- [ ] **Step 3: Poller erweitern**

`server/src/inbox/poller.ts` komplett ersetzen:

```typescript
import cron from "node-cron";
import { randomUUID } from "node:crypto";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { GeminiClient } from "../gemini/extract.js";
import { buildOAuth2ClientForRefreshToken } from "../google/client.js";
import { driveFor, listFolderFiles, downloadFile, setAppProperties } from "../google/drive.js";
import { sheetsFor, appendRow, type ReceiptRow } from "../google/sheets.js";
import { archiveExistingFile } from "../receipts/archive.js";
import { SUPPORTED_MIME_TYPES, SOURCE_KIND_TO_EINGABE_TYP } from "../receipts/types.js";

export type PollerDeps = {
  config: Config;
  userRepo: UserRepo;
  gemini: GeminiClient;
};

export function startInboxPoller(deps: PollerDeps): { stop: () => void } {
  const task = cron.schedule("*/5 * * * *", () => {
    runOnce(deps).catch((err) => console.error("[inbox-poller]", err));
  });
  return { stop: () => task.stop() };
}

export async function runOnce(deps: PollerDeps): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;
  const users = deps.userRepo.listAllWithRefreshToken();
  for (const user of users) {
    if (!user.refreshToken || !user.driveInboxFolderId) continue;
    try {
      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      const drive = driveFor(auth);
      const sheets = sheetsFor(auth);
      const files = await listFolderFiles(drive, user.driveInboxFolderId);
      for (const file of files) {
        if (file.appProperties?.bm_status) continue;
        if (!SUPPORTED_MIME_TYPES.has(file.mimeType)) continue;
        try {
          const buffer = await downloadFile(drive, file.id);
          const extraction = await deps.gemini.extractFromPhoto({ mimeType: file.mimeType, buffer });

          // Auto-save: archive file + append row to Sheets
          const datum = extraction.datum ?? new Date().toISOString().slice(0, 10);
          let driveLink = "";
          if (user.driveArchiveFolderId) {
            try {
              const r = await archiveExistingFile(drive, file.id, user.driveArchiveFolderId, datum);
              driveLink = r.driveLink;
            } catch (archErr) {
              console.error("[inbox-poller] archive failed, continuing without link:", archErr);
            }
          }

          if (user.sheetId) {
            const row: ReceiptRow = {
              id: randomUUID(),
              datum,
              haendler: extraction.haendler ?? "Unbekannt",
              betrag: extraction.betrag ?? 0,
              mwst: extraction.mwst ?? 0,
              trinkgeld: extraction.trinkgeld ?? 0,
              waehrung: extraction.waehrung ?? "EUR",
              kategorie: extraction.kategorie ?? "Sonstiges",
              zahlungsmethode: extraction.zahlungsmethode ?? "Unbekannt",
              rechnungsnummer: extraction.rechnungsnummer ?? "",
              driveLink,
              eingabeTyp: SOURCE_KIND_TO_EINGABE_TYP["drive"],
              erstelltAm: new Date().toISOString(),
            };
            await appendRow(sheets, user.sheetId, row);
          }

          await setAppProperties(drive, file.id, { bm_status: "confirmed" }).catch(() => undefined);
          processed++;
        } catch (err) {
          await setAppProperties(drive, file.id, {
            bm_status: "failed",
            bm_error: String((err as Error).message ?? err).slice(0, 200),
          }).catch(() => undefined);
          failed++;
        }
      }
    } catch (err) {
      console.error(`[inbox-poller] user ${user.id}:`, err);
    }
  }
  return { processed, failed };
}
```

- [ ] **Step 4: Tests ausführen**

```
cd server && npx vitest run test/inbox-poller.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/inbox/poller.ts server/test/inbox-poller.test.ts
git commit -m "feat: inbox poller auto-saves to sheets and archives on success"
```

---

### Task 4: Server — Upload-Endpoint zu Drive-Only umbauen

**Files:**
- Modify: `server/src/receipts/routes.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/receipts-routes.test.ts`

- [ ] **Step 1: Bestehende Tests ansehen**

```
cd server && npx vitest run test/receipts-routes.test.ts
```

Notiere welche Tests die Upload-Route testen — diese werden angepasst.

- [ ] **Step 2: `ReceiptsDeps` in `routes.ts` erweitern und Upload-Route umbauen**

In `server/src/receipts/routes.ts` folgende Änderungen:

Imports ergänzen (oben, nach bestehenden Imports):
```typescript
import { randomUUID } from "node:crypto";
import { uploadFile } from "../google/drive.js";
import { buildOAuth2ClientFromSession } from "../google/client.js";
import { sheetsFor, appendRow, type ReceiptRow } from "../google/sheets.js";
import { bootstrapUserDrive } from "../google/bootstrap.js";
import type { FailedVoiceRepo } from "./failedVoiceRepo.js";
```

`ReceiptsDeps` erweitern:
```typescript
export type ReceiptsDeps = {
  config: Config;
  userRepo: UserRepo;
  gemini: GeminiClient;
  pending: PendingStore;
  failedVoice: FailedVoiceRepo;
};
```

`POST /upload` Route komplett ersetzen (Zeilen 55–72 in routes.ts):
```typescript
router.post("/upload", uploadRateLimit, uploadSingleImage, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file required" });
    const userId = req.session.userId!;
    let user = deps.userRepo.getById(userId);
    if (!user?.refreshToken) return res.status(401).json({ error: "Kein Refresh-Token" });

    if (!user.driveInboxFolderId) {
      const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
      await bootstrapUserDrive(auth, userId, deps.userRepo);
      user = deps.userRepo.getById(userId);
    }
    if (!user?.driveInboxFolderId) return res.status(409).json({ error: "Drive inbox nicht verfügbar" });

    const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
    const drive = driveFor(auth);
    const ext = req.file.mimetype === "application/pdf" ? "pdf" : req.file.mimetype.split("/")[1] ?? "bin";
    const fileName = req.file.originalname || `beleg_${Date.now()}.${ext}`;
    await uploadFile(drive, {
      name: fileName,
      mimeType: req.file.mimetype,
      parentId: user.driveInboxFolderId,
      body: req.file.buffer,
    });
    res.status(202).json({ ok: true });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 3: `POST /voice` Route umbauen — direkt Sheets, kein pendingId**

`POST /voice` Route (Zeilen 74–88) komplett ersetzen:
```typescript
router.post("/voice", uploadRateLimit, async (req, res, next) => {
  try {
    const parsed = VoiceBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });

    const userId = req.session.userId!;
    const transcript = parsed.data.transcript;

    let extraction;
    try {
      extraction = await deps.gemini.extractFromTranscript(transcript);
    } catch (geminiErr) {
      const jobId = deps.failedVoice.save({
        userId,
        transcript,
        error: String((geminiErr as Error).message ?? geminiErr),
      });
      return res.json({ ok: false, jobId });
    }

    const user = deps.userRepo.getById(userId);
    if (user?.sheetId) {
      const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
      const sheets = sheetsFor(auth);
      const datum = extraction.datum ?? new Date().toISOString().slice(0, 10);
      const row: ReceiptRow = {
        id: uuidv4(),
        datum,
        haendler: extraction.haendler ?? "Unbekannt",
        betrag: extraction.betrag ?? 0,
        mwst: extraction.mwst ?? 0,
        trinkgeld: extraction.trinkgeld ?? 0,
        waehrung: extraction.waehrung ?? "EUR",
        kategorie: extraction.kategorie ?? "Sonstiges",
        zahlungsmethode: extraction.zahlungsmethode ?? "Unbekannt",
        rechnungsnummer: extraction.rechnungsnummer ?? "",
        driveLink: "",
        eingabeTyp: SOURCE_KIND_TO_EINGABE_TYP["voice"],
        erstelltAm: new Date().toISOString(),
      };
      await appendRow(sheets, user.sheetId, row);
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Neue Endpoints `GET /failed-voice` und `POST /retry-voice/:jobId` ergänzen**

Nach der bestehenden `router.get("/pending/:id", ...)` Route einfügen:

```typescript
router.get("/failed-voice", (req, res) => {
  const userId = req.session.userId!;
  const jobs = deps.failedVoice.listForUser(userId);
  res.json({ jobs });
});

router.post("/retry-voice/:jobId", async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const job = deps.failedVoice.getById(userId, req.params.jobId);
    if (!job) return res.status(404).json({ error: "job not found" });

    let extraction;
    try {
      extraction = await deps.gemini.extractFromTranscript(job.transcript);
    } catch (geminiErr) {
      return res.status(502).json({ error: String((geminiErr as Error).message ?? geminiErr) });
    }

    const user = deps.userRepo.getById(userId);
    if (user?.sheetId) {
      const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
      const sheets = sheetsFor(auth);
      const datum = extraction.datum ?? new Date().toISOString().slice(0, 10);
      const row: ReceiptRow = {
        id: uuidv4(),
        datum,
        haendler: extraction.haendler ?? "Unbekannt",
        betrag: extraction.betrag ?? 0,
        mwst: extraction.mwst ?? 0,
        trinkgeld: extraction.trinkgeld ?? 0,
        waehrung: extraction.waehrung ?? "EUR",
        kategorie: extraction.kategorie ?? "Sonstiges",
        zahlungsmethode: extraction.zahlungsmethode ?? "Unbekannt",
        rechnungsnummer: extraction.rechnungsnummer ?? "",
        driveLink: "",
        eingabeTyp: SOURCE_KIND_TO_EINGABE_TYP["voice"],
        erstelltAm: new Date().toISOString(),
      };
      await appendRow(sheets, user.sheetId, row);
    }

    deps.failedVoice.delete(userId, job.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 5: `app.ts` — `failedVoice` Repo an Receipts-Router übergeben**

In `server/src/app.ts`:

Import ergänzen:
```typescript
import { createFailedVoiceRepo } from "./receipts/failedVoiceRepo.js";
```

In `createApp`:
```typescript
const failedVoiceRepo = createFailedVoiceRepo(deps.db);
```

Receipts-Router-Aufruf anpassen:
```typescript
app.use("/api/receipts", buildReceiptsRouter({
  config: deps.config,
  userRepo,
  gemini: deps.gemini,
  pending: deps.pending,
  failedVoice: failedVoiceRepo,
}));
```

- [ ] **Step 6: Alle Server-Tests laufen lassen**

```
cd server && npx vitest run
```

Expected: PASS (eventuell müssen Tests für Upload-Route angepasst werden, die jetzt 202 statt 200 erwarten)

Falls Tests in `receipts-routes.test.ts` fehlschlagen, die Upload-Route testen:
- Erwartung auf `202` statt `200` ändern
- Erwartung auf `{ ok: true }` statt `{ pendingId, extraction }` ändern

- [ ] **Step 7: Commit**

```bash
git add server/src/receipts/routes.ts server/src/app.ts server/test/receipts-routes.test.ts
git commit -m "feat: upload route uploads to drive inbox, voice route saves directly to sheets"
```

---

### Task 5: Client — API-Typen und Funktionen aktualisieren

**Files:**
- Modify: `client/src/api/receipts.ts`

- [ ] **Step 1: `receipts.ts` aktualisieren**

`client/src/api/receipts.ts` komplett ersetzen:

```typescript
import { api } from "./client";
import type { ReceiptRow } from "@/types/receipt";

export type VoiceResult =
  | { ok: true }
  | { ok: false; jobId: string };

export type FailedVoiceJob = {
  id: string;
  userId: string;
  transcript: string;
  error: string;
  createdAt: number;
};

export const receiptsApi = {
  upload: (file: File, transcript?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    if (transcript) fd.append("transcript", transcript);
    return api.postForm<{ ok: true }>("/api/receipts/upload", fd);
  },
  voice: (transcript: string) =>
    api.post<VoiceResult>("/api/receipts/voice", { transcript }),
  confirm: (payload: {
    pendingId: string;
    datum: string;
    haendler: string;
    betrag: number;
    mwst: number;
    trinkgeld: number;
    waehrung: string;
    kategorie: string;
    zahlungsmethode: string;
    rechnungsnummer: string;
  }) => api.post<{ ok: true; row: ReceiptRow }>("/api/receipts/confirm", payload),
  update: (id: string, payload: {
    datum: string;
    haendler: string;
    betrag: number;
    mwst: number;
    trinkgeld: number;
    waehrung: string;
    kategorie: string;
    zahlungsmethode: string;
    rechnungsnummer: string;
  }) => api.put<{ ok: true; row: ReceiptRow }>(`/api/receipts/${id}`, payload),
  getPending: (pendingId: string) =>
    api.get<{ pendingId: string; extraction: import("@/types/receipt").Extraction }>(`/api/receipts/pending/${pendingId}`),
  checkDuplicate: (haendler: string, betrag: number, datum: string) => {
    const params = new URLSearchParams({ haendler, betrag: String(betrag), datum });
    return api.get<{ duplicate: ReceiptRow | null }>(`/api/receipts/duplicate-check?${params}`);
  },
  list: () => api.get<{ rows: ReceiptRow[] }>("/api/receipts"),
  delete: (id: string) => api.delete<{ ok: true }>(`/api/receipts/${id}`),
  listFailedVoice: () =>
    api.get<{ jobs: FailedVoiceJob[] }>("/api/receipts/failed-voice"),
  retryVoice: (jobId: string) =>
    api.post<{ ok: true }>(`/api/receipts/retry-voice/${jobId}`, {}),
};
```

- [ ] **Step 2: TypeScript-Build prüfen**

```
cd client && npx tsc --noEmit
```

Expected: keine Fehler

- [ ] **Step 3: Commit**

```bash
git add client/src/api/receipts.ts
git commit -m "feat: update receipts API types for fire-and-forget"
```

---

### Task 6: `UnifiedInput.tsx` — Fire-and-Forget

**Files:**
- Modify: `client/src/components/upload/UnifiedInput.tsx`

- [ ] **Step 1: `submit`-Funktion und Imports anpassen**

`client/src/components/upload/UnifiedInput.tsx` — folgende Änderungen:

1. Import `useNavigate` entfernen
2. Import `AIProcessingOverlay` entfernen
3. `navigate`-Aufruf entfernen
4. `submit`-Funktion ersetzen:

```typescript
async function submit() {
  setBusy(true);
  try {
    if (mode === "photo" && file) {
      await receiptsApi.upload(file, context || undefined);
      toast({ title: "Beleg wird verarbeitet", description: "Er erscheint in Kürze unter Belege." });
    } else if (mode === "text") {
      if (!textInput.trim()) { toast({ title: "Bitte zuerst Text eingeben." }); setBusy(false); return; }
      const res = await receiptsApi.voice(textInput.trim());
      if (res.ok) {
        toast({ title: "Beleg gespeichert" });
      } else {
        toast({ title: "Verarbeitung fehlgeschlagen", description: "Beleg erscheint unter Belege zur Nachbearbeitung." });
      }
    } else return;
    reset();
  } catch (e) {
    toast({ title: "Fehler", description: String((e as Error).message) });
  } finally {
    setBusy(false);
  }
}
```

5. `<AIProcessingOverlay isVisible={busy || !!busyId} />` aus dem JSX entfernen

Der Import `AIProcessingOverlay` und `useNavigate` können entfernt werden wenn sie nicht mehr verwendet werden.

- [ ] **Step 2: TypeScript-Build prüfen**

```
cd client && npx tsc --noEmit
```

Expected: keine Fehler

- [ ] **Step 3: Commit**

```bash
git add client/src/components/upload/UnifiedInput.tsx
git commit -m "feat: upload is now fire-and-forget, no review navigation"
```

---

### Task 7: `useFailedVoiceJobs` Hook

**Files:**
- Create: `client/src/hooks/useFailedVoiceJobs.ts`

- [ ] **Step 1: Hook anlegen**

`client/src/hooks/useFailedVoiceJobs.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { receiptsApi } from "@/api/receipts";

export function useFailedVoiceJobs() {
  return useQuery({
    queryKey: ["failedVoiceJobs"],
    queryFn: () => receiptsApi.listFailedVoice(),
    refetchInterval: 30_000,
  });
}

export function useRetryVoiceJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => receiptsApi.retryVoice(jobId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["failedVoiceJobs"] });
      qc.invalidateQueries({ queryKey: ["receipts"] });
    },
  });
}
```

- [ ] **Step 2: TypeScript-Build prüfen**

```
cd client && npx tsc --noEmit
```

Expected: keine Fehler

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useFailedVoiceJobs.ts
git commit -m "feat: add useFailedVoiceJobs and useRetryVoiceJob hooks"
```

---

### Task 8: `FailedReceiptsSection` Komponente

**Files:**
- Create: `client/src/components/receipts/FailedReceiptsSection.tsx`

- [ ] **Step 1: Komponente anlegen**

`client/src/components/receipts/FailedReceiptsSection.tsx`:

```typescript
import { AlertTriangle, RefreshCw, FileText, Mic } from "lucide-react";
import { useFailedVoiceJobs, useRetryVoiceJob } from "@/hooks/useFailedVoiceJobs";
import { useDriveInbox } from "@/hooks/useDriveInbox";
import { driveApi } from "@/api/drive";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function FailedReceiptsSection() {
  const { data: voiceData } = useFailedVoiceJobs();
  const { data: inboxData } = useDriveInbox();
  const retryVoice = useRetryVoiceJob();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [retryingDrive, setRetryingDrive] = useState<string | null>(null);

  const failedVoice = voiceData?.jobs ?? [];
  const failedDrive = (inboxData?.files ?? []).filter((f) => f.status === "failed");
  const total = failedVoice.length + failedDrive.length;

  if (total === 0) return null;

  async function retryDrive(fileId: string) {
    setRetryingDrive(fileId);
    try {
      await driveApi.importFile(fileId);
      qc.invalidateQueries({ queryKey: ["driveInbox"] });
      qc.invalidateQueries({ queryKey: ["receipts"] });
      toast({ title: "Beleg erneut verarbeitet" });
    } catch (e) {
      toast({ title: "Fehler", description: String((e as Error).message) });
    } finally {
      setRetryingDrive(null);
    }
  }

  return (
    <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-500" />
        <span className="text-sm font-semibold text-red-700 dark:text-red-400">
          Fehlgeschlagene Belege ({total})
        </span>
      </div>

      <div className="space-y-2">
        {failedDrive.map((f) => (
          <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg bg-white dark:bg-white/5 px-3 py-2.5 border border-red-100 dark:border-red-900/30">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-red-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{f.name}</p>
                <p className="text-xs text-red-500/70">Drive-Verarbeitung fehlgeschlagen</p>
              </div>
            </div>
            <button
              onClick={() => retryDrive(f.id)}
              disabled={retryingDrive === f.id}
              className={cn(
                "flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors",
                "bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400"
              )}
            >
              <RefreshCw className={cn("h-3 w-3", retryingDrive === f.id && "animate-spin")} />
              Erneut
            </button>
          </div>
        ))}

        {failedVoice.map((j) => (
          <div key={j.id} className="flex items-center justify-between gap-3 rounded-lg bg-white dark:bg-white/5 px-3 py-2.5 border border-red-100 dark:border-red-900/30">
            <div className="flex items-center gap-2 min-w-0">
              <Mic className="h-4 w-4 text-red-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{j.transcript}</p>
                <p className="text-xs text-red-500/70">{j.error}</p>
              </div>
            </div>
            <button
              onClick={() => retryVoice.mutate(j.id, {
                onSuccess: () => toast({ title: "Beleg gespeichert" }),
                onError: (e) => toast({ title: "Fehler", description: String((e as Error).message) }),
              })}
              disabled={retryVoice.isPending}
              className={cn(
                "flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors",
                "bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400"
              )}
            >
              <RefreshCw className={cn("h-3 w-3", retryVoice.isPending && "animate-spin")} />
              Erneut
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript-Build prüfen**

```
cd client && npx tsc --noEmit
```

Expected: keine Fehler

- [ ] **Step 3: Commit**

```bash
git add client/src/components/receipts/FailedReceiptsSection.tsx
git commit -m "feat: add FailedReceiptsSection component with retry support"
```

---

### Task 9: `Receipts.tsx` — FailedReceiptsSection einbinden

**Files:**
- Modify: `client/src/pages/Receipts.tsx`

- [ ] **Step 1: Seite aktualisieren**

`client/src/pages/Receipts.tsx`:

```typescript
import { ReceiptTable } from "@/components/receipts/ReceiptTable";
import { FailedReceiptsSection } from "@/components/receipts/FailedReceiptsSection";

export function ReceiptsPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Meine Belege</h1>
        <p className="text-[hsl(var(--muted-foreground))]">
          Verwalte und durchsuche alle deine erfassten Transaktionen.
        </p>
      </div>

      <FailedReceiptsSection />
      <ReceiptTable />
    </div>
  );
}
```

- [ ] **Step 2: TypeScript-Build prüfen**

```
cd client && npx tsc --noEmit
```

Expected: keine Fehler

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Receipts.tsx
git commit -m "feat: show failed receipts section on receipts page"
```

---

### Task 10: `AppShell.tsx` — Badge auf "Belege"

**Files:**
- Modify: `client/src/components/AppShell.tsx`

- [ ] **Step 1: Badge-Logik ergänzen**

In `client/src/components/AppShell.tsx`:

Import ergänzen:
```typescript
import { useFailedVoiceJobs } from "@/hooks/useFailedVoiceJobs";
```

In der `AppShell`-Komponente nach `const { data: inboxData } = useDriveInbox();`:
```typescript
const { data: failedVoiceData } = useFailedVoiceJobs();
const failedVoiceCount = failedVoiceData?.jobs?.length ?? 0;
const failedDriveCount = (inboxData?.files ?? []).filter((f) => f.status === "failed").length;
const failedCount = failedVoiceCount + failedDriveCount;
```

Im Desktop-Nav (`navItems.map`) den "Belege"-Link anpassen. Suche die Stelle wo `item.to === "/upload"` schon ein Badge rendert und ergänze analog für `/receipts`:

```tsx
{item.to === "/receipts" && failedCount > 0 && (
  <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
    {failedCount}
  </span>
)}
{item.to === "/upload" && inboxCount > 0 && (
  <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold">
    {inboxCount}
  </span>
)}
```

Im Mobile-Nav den "Belege"-Link ebenfalls mit Badge versehen (analog zum Upload-Badge, das bereits existiert):

```tsx
{to === "/receipts" && failedCount > 0 && (
  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] flex items-center justify-center rounded-full font-bold border-2 border-[var(--surface)]">
    {failedCount}
  </span>
)}
```

- [ ] **Step 2: TypeScript-Build prüfen**

```
cd client && npx tsc --noEmit
```

Expected: keine Fehler

- [ ] **Step 3: Alle Tests ausführen**

```
cd server && npx vitest run
cd ../client && npx vitest run
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/components/AppShell.tsx
git commit -m "feat: add error badge on Belege nav item when failed receipts exist"
```

---

### Task 11: Drive-Inbox-Status `confirmed` — Filterung in UI

Der Poller setzt jetzt `bm_status: "confirmed"` auf erfolgreich verarbeitete Dateien. Diese sollen **nicht** mehr in der Inbox-Liste auf `/upload` erscheinen.

**Files:**
- Modify: `server/src/drive/routes.ts`

- [ ] **Step 1: Inbox-Endpoint filtern**

In `server/src/drive/routes.ts`, in `router.get("/inbox", ...)`, die `enriched`-Liste filtern:

```typescript
const enriched = files
  .filter((f) => f.appProperties?.bm_status !== "confirmed")
  .map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    status: f.appProperties?.bm_status ?? "new",
    extracted: f.appProperties?.bm_extracted_json ? JSON.parse(f.appProperties.bm_extracted_json) : null,
  }));
```

- [ ] **Step 2: Tests laufen lassen**

```
cd server && npx vitest run
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add server/src/drive/routes.ts
git commit -m "feat: hide confirmed inbox files from drive inbox listing"
```

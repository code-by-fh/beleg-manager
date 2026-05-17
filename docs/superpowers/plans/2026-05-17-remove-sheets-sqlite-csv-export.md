# Remove Google Sheets — SQLite + CSV Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Google Sheets as the primary data store for confirmed receipts with SQLite, and add a CSV download endpoint.

**Architecture:** A new `receiptRepo` module wraps all SQLite access for receipts. Every server route that previously called `google/sheets.ts` is updated to call `receiptRepo` instead. `google/sheets.ts` is deleted at the end once all callers are gone.

**Tech Stack:** TypeScript, better-sqlite3, Express, Vitest — no new packages needed.

---

## File Map

| Action | File |
|---|---|
| Create | `server/src/receipts/receiptRepo.ts` |
| Modify | `server/src/db/migrations.ts` |
| Modify | `server/src/receipts/types.ts` |
| Modify | `server/src/stats/compute.ts` |
| Modify | `server/src/receipts/routes.ts` |
| Modify | `server/src/drive/routes.ts` |
| Modify | `server/src/inbox/poller.ts` |
| Modify | `server/src/telegram/bot.ts` |
| Modify | `server/src/stats/routes.ts` |
| Modify | `server/src/google/bootstrap.ts` |
| Modify | `server/src/splits/routes.ts` |
| Modify | `server/src/app.ts` |
| Delete | `server/src/google/sheets.ts` |
| Create | `server/test/receiptRepo.test.ts` |

---

## Task 1: Add `receipts` table migration

**Files:**
- Modify: `server/src/db/migrations.ts`

- [ ] **Step 1: Add the receipts table to SCHEMA and add an index**

In `server/src/db/migrations.ts`, append to the end of the `SCHEMA` string constant (before the closing backtick):

```typescript
CREATE TABLE IF NOT EXISTS receipts (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_receipts_user ON receipts(user_id);
```

- [ ] **Step 2: Verify migration runs on fresh DB**

```bash
cd server && npx tsx -e "
import { openDatabase } from './src/db/index.js';
import { runMigrations } from './src/db/migrations.js';
const db = openDatabase(':memory:');
runMigrations(db);
const cols = db.prepare(\"PRAGMA table_info(receipts)\").all();
console.log(cols.map(c => c.name));
"
```
Expected output: `[ 'id', 'user_id', 'datum', 'haendler', 'betrag', 'mwst', 'trinkgeld', 'waehrung', 'kategorie', 'zahlungsmethode', 'rechnungsnummer', 'drive_link', 'eingabe_typ', 'erstellt_am' ]`

- [ ] **Step 3: Commit**

```bash
git add server/src/db/migrations.ts
git commit -m "feat(db): add receipts table to SQLite schema"
```

---

## Task 2: Create `receiptRepo.ts` with tests

**Files:**
- Create: `server/src/receipts/receiptRepo.ts`
- Create: `server/test/receiptRepo.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/test/receiptRepo.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { openDatabase } from "../src/db/index.js";
import { runMigrations } from "../src/db/migrations.js";
import { createReceiptRepo } from "../src/receipts/receiptRepo.js";

function makeRepo() {
  const db = openDatabase(":memory:");
  runMigrations(db);
  db.prepare("INSERT INTO users (id, email, name, created_at) VALUES ('u1', 'a@b.com', 'A', 1)").run();
  return createReceiptRepo(db);
}

const baseRow = {
  id: "r1",
  datum: "2024-03-15",
  haendler: "Edeka",
  betrag: 42.5,
  mwst: 3.0,
  trinkgeld: 0,
  waehrung: "EUR",
  kategorie: "Lebensmittel",
  zahlungsmethode: "Karte",
  rechnungsnummer: "",
  driveLink: "",
  eingabeTyp: "foto" as const,
  erstelltAm: "2024-03-15T10:00:00.000Z",
};

describe("receiptRepo", () => {
  it("insert and findAll returns inserted row", () => {
    const repo = makeRepo();
    repo.insert("u1", baseRow);
    const rows = repo.findAll("u1");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("r1");
    expect(rows[0].haendler).toBe("Edeka");
    expect(rows[0].betrag).toBe(42.5);
  });

  it("findAll returns only rows for given user", () => {
    const repo = makeRepo();
    const db = (repo as any)._db; // won't be exposed, but the repo is scoped by userId
    repo.insert("u1", baseRow);
    const rows = repo.findAll("u2");
    expect(rows).toHaveLength(0);
  });

  it("findById returns the row for the right user", () => {
    const repo = makeRepo();
    repo.insert("u1", baseRow);
    expect(repo.findById("u1", "r1")).toBeDefined();
    expect(repo.findById("u2", "r1")).toBeUndefined();
  });

  it("update modifies existing row", () => {
    const repo = makeRepo();
    repo.insert("u1", baseRow);
    const ok = repo.update("u1", { ...baseRow, haendler: "Rewe", betrag: 10 });
    expect(ok).toBe(true);
    expect(repo.findById("u1", "r1")?.haendler).toBe("Rewe");
  });

  it("update returns false for unknown id", () => {
    const repo = makeRepo();
    expect(repo.update("u1", { ...baseRow, id: "nope" })).toBe(false);
  });

  it("delete removes the row", () => {
    const repo = makeRepo();
    repo.insert("u1", baseRow);
    expect(repo.delete("u1", "r1")).toBe(true);
    expect(repo.findAll("u1")).toHaveLength(0);
  });

  it("delete returns false for unknown id", () => {
    const repo = makeRepo();
    expect(repo.delete("u1", "nope")).toBe(false);
  });

  it("checkDuplicate detects same haendler+betrag within 1 day", () => {
    const repo = makeRepo();
    repo.insert("u1", baseRow);
    expect(repo.checkDuplicate("u1", "2024-03-15", "Edeka", 42.5)).toBe(true);
    expect(repo.checkDuplicate("u1", "2024-03-16", "Edeka", 42.5)).toBe(true);
  });

  it("checkDuplicate is case-insensitive for haendler", () => {
    const repo = makeRepo();
    repo.insert("u1", baseRow);
    expect(repo.checkDuplicate("u1", "2024-03-15", "edeka", 42.5)).toBe(true);
  });

  it("checkDuplicate does not match beyond 1 day", () => {
    const repo = makeRepo();
    repo.insert("u1", baseRow);
    expect(repo.checkDuplicate("u1", "2024-03-17", "Edeka", 42.5)).toBe(false);
  });

  it("checkDuplicate does not match different betrag", () => {
    const repo = makeRepo();
    repo.insert("u1", baseRow);
    expect(repo.checkDuplicate("u1", "2024-03-15", "Edeka", 99)).toBe(false);
  });

  it("checkDuplicate is scoped to user", () => {
    const repo = makeRepo();
    repo.insert("u1", baseRow);
    expect(repo.checkDuplicate("u2", "2024-03-15", "Edeka", 42.5)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd server && npm test -- receiptRepo
```
Expected: FAIL — `Cannot find module '../src/receipts/receiptRepo.js'`

- [ ] **Step 3: Create `receiptRepo.ts`**

Create `server/src/receipts/receiptRepo.ts`:

```typescript
import type { Db } from "../db/index.js";

export type ReceiptRow = {
  id: string;
  datum: string;
  haendler: string;
  betrag: number;
  mwst: number;
  trinkgeld: number;
  waehrung: string;
  kategorie: string;
  zahlungsmethode: string;
  rechnungsnummer: string;
  driveLink: string;
  eingabeTyp: "foto" | "sprache" | "drive" | "telegram" | "email";
  erstelltAm: string;
};

type DbReceiptRow = {
  id: string;
  user_id: string;
  datum: string;
  haendler: string;
  betrag: number;
  mwst: number;
  trinkgeld: number;
  waehrung: string;
  kategorie: string;
  zahlungsmethode: string;
  rechnungsnummer: string;
  drive_link: string;
  eingabe_typ: string;
  erstellt_am: string;
};

function fromDb(r: DbReceiptRow): ReceiptRow {
  return {
    id: r.id,
    datum: r.datum,
    haendler: r.haendler,
    betrag: r.betrag,
    mwst: r.mwst,
    trinkgeld: r.trinkgeld,
    waehrung: r.waehrung,
    kategorie: r.kategorie,
    zahlungsmethode: r.zahlungsmethode,
    rechnungsnummer: r.rechnungsnummer,
    driveLink: r.drive_link,
    eingabeTyp: r.eingabe_typ as ReceiptRow["eingabeTyp"],
    erstelltAm: r.erstellt_am,
  };
}

export function createReceiptRepo(db: Db) {
  const insertStmt = db.prepare<[
    string, string, string, string, number, number, number,
    string, string, string, string, string, string, string
  ]>(`
    INSERT INTO receipts
      (id, user_id, datum, haendler, betrag, mwst, trinkgeld,
       waehrung, kategorie, zahlungsmethode, rechnungsnummer,
       drive_link, eingabe_typ, erstellt_am)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const findAllStmt = db.prepare<[string]>(
    `SELECT * FROM receipts WHERE user_id = ? ORDER BY datum DESC, erstellt_am DESC`
  );

  const findByIdStmt = db.prepare<[string, string]>(
    `SELECT * FROM receipts WHERE user_id = ? AND id = ?`
  );

  const updateStmt = db.prepare<[
    string, string, number, number, number, string, string, string, string, string, string, string, string
  ]>(`
    UPDATE receipts SET
      datum = ?, haendler = ?, betrag = ?, mwst = ?, trinkgeld = ?,
      waehrung = ?, kategorie = ?, zahlungsmethode = ?, rechnungsnummer = ?,
      drive_link = ?, eingabe_typ = ?, erstellt_am = ?
    WHERE user_id = ? AND id = ?
  `);

  const deleteStmt = db.prepare<[string, string]>(
    `DELETE FROM receipts WHERE user_id = ? AND id = ?`
  );

  const duplicateStmt = db.prepare<[string, string, number]>(`
    SELECT 1 FROM receipts
    WHERE user_id = ?
      AND LOWER(haendler) = LOWER(?)
      AND betrag = ?
      AND ABS(JULIANDAY(datum) - JULIANDAY(?)) <= 1
    LIMIT 1
  `);

  return {
    insert(userId: string, row: ReceiptRow): void {
      insertStmt.run(
        row.id, userId, row.datum, row.haendler, row.betrag, row.mwst, row.trinkgeld,
        row.waehrung, row.kategorie, row.zahlungsmethode, row.rechnungsnummer,
        row.driveLink, row.eingabeTyp, row.erstelltAm
      );
    },

    findAll(userId: string): ReceiptRow[] {
      return (findAllStmt.all(userId) as DbReceiptRow[]).map(fromDb);
    },

    findById(userId: string, id: string): ReceiptRow | undefined {
      const row = findByIdStmt.get(userId, id) as DbReceiptRow | undefined;
      return row ? fromDb(row) : undefined;
    },

    update(userId: string, row: ReceiptRow): boolean {
      const result = db.prepare<[
        string, string, number, number, number, string, string, string, string, string, string, string, string, string
      ]>(`
        UPDATE receipts SET
          datum = ?, haendler = ?, betrag = ?, mwst = ?, trinkgeld = ?,
          waehrung = ?, kategorie = ?, zahlungsmethode = ?, rechnungsnummer = ?,
          drive_link = ?, eingabe_typ = ?, erstellt_am = ?
        WHERE user_id = ? AND id = ?
      `).run(
        row.datum, row.haendler, row.betrag, row.mwst, row.trinkgeld,
        row.waehrung, row.kategorie, row.zahlungsmethode, row.rechnungsnummer,
        row.driveLink, row.eingabeTyp, row.erstelltAm,
        userId, row.id
      );
      return result.changes > 0;
    },

    delete(userId: string, id: string): boolean {
      const result = deleteStmt.run(userId, id);
      return result.changes > 0;
    },

    checkDuplicate(userId: string, datum: string, haendler: string, betrag: number): boolean {
      const row = (db.prepare<[string, string, number, string]>(`
        SELECT 1 FROM receipts
        WHERE user_id = ?
          AND LOWER(haendler) = LOWER(?)
          AND betrag = ?
          AND ABS(JULIANDAY(datum) - JULIANDAY(?)) <= 1
        LIMIT 1
      `)).get(userId, haendler, betrag, datum);
      return row !== undefined;
    },
  };
}

export type ReceiptRepo = ReturnType<typeof createReceiptRepo>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd server && npm test -- receiptRepo
```
Expected: all 11 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/receipts/receiptRepo.ts server/test/receiptRepo.test.ts
git commit -m "feat(receipts): add SQLite-backed receiptRepo with ReceiptRow type"
```

---

## Task 3: Update `receipts/types.ts` — fix ReceiptRow import

**Files:**
- Modify: `server/src/receipts/types.ts`

- [ ] **Step 1: Replace the import**

In `server/src/receipts/types.ts`, change:
```typescript
import type { ReceiptRow } from "../google/sheets.js";
```
to:
```typescript
import type { ReceiptRow } from "./receiptRepo.js";
```

- [ ] **Step 2: Typecheck**

```bash
cd server && npm run typecheck 2>&1 | grep "types.ts"
```
Expected: no errors for `types.ts`

- [ ] **Step 3: Commit**

```bash
git add server/src/receipts/types.ts
git commit -m "refactor(types): import ReceiptRow from receiptRepo instead of sheets"
```

---

## Task 4: Update `stats/compute.ts` — fix ReceiptRow import

**Files:**
- Modify: `server/src/stats/compute.ts`

- [ ] **Step 1: Replace the import**

In `server/src/stats/compute.ts`, change:
```typescript
import type { ReceiptRow } from "../google/sheets.js";
```
to:
```typescript
import type { ReceiptRow } from "../receipts/receiptRepo.js";
```

- [ ] **Step 2: Run stats compute tests**

```bash
cd server && npm test -- stats-compute
```
Expected: PASS (no logic changed, only import)

- [ ] **Step 3: Commit**

```bash
git add server/src/stats/compute.ts
git commit -m "refactor(stats): import ReceiptRow from receiptRepo instead of sheets"
```

---

## Task 5: Rewrite `receipts/routes.ts` — replace Sheets with receiptRepo + add CSV export

**Files:**
- Modify: `server/src/receipts/routes.ts`

- [ ] **Step 1: Write a failing test for the CSV export endpoint**

Add to `server/test/receipts-routes.test.ts` (append after the existing `describe` block):

```typescript
import { createReceiptRepo } from "../src/receipts/receiptRepo.js";

describe("receipts routes — CSV export", () => {
  it("GET /export/csv returns 401 without session", async () => {
    const { app } = makeTestApp();
    const res = await request(app).get("/api/receipts/export/csv");
    expect(res.status).toBe(401);
  });
});
```

Run: `cd server && npm test -- receipts-routes`
Expected: PASS (401 check passes even with current code since route doesn't exist yet — `requireAuth` fires first)

- [ ] **Step 2: Rewrite `receipts/routes.ts`**

Replace the entire file `server/src/receipts/routes.ts` with:

```typescript
import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { GeminiClient } from "../gemini/extract.js";
import type { PendingStore } from "./pendingStore.js";
import type { FailedVoiceRepo } from "./failedVoiceRepo.js";
import type { ReceiptRepo } from "./receiptRepo.js";
import { SOURCE_KIND_TO_EINGABE_TYP } from "./types.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { uploadSingleImage } from "../middleware/upload.js";
import { uploadRateLimit } from "../middleware/rateLimit.js";
import { buildOAuth2ClientForRefreshToken } from "../google/client.js";
import { driveFor, uploadFile, setAppProperties } from "../google/drive.js";
import { archiveExistingFile, archiveBuffer } from "./archive.js";
import { bootstrapUserDrive } from "../google/bootstrap.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "receipts-routes" });

const VoiceBody = z.object({ transcript: z.string().min(1).max(4000) });

const ConfirmBody = z.object({
  pendingId: z.string().min(1),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  haendler: z.string().min(1),
  betrag: z.number().nonnegative(),
  mwst: z.number().nonnegative(),
  trinkgeld: z.number().nonnegative().default(0),
  waehrung: z.string().min(1),
  kategorie: z.string().min(1),
  zahlungsmethode: z.string().min(1),
  rechnungsnummer: z.string().default(""),
});

const UpdateBody = z.object({
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  haendler: z.string().min(1),
  betrag: z.number().nonnegative(),
  mwst: z.number().nonnegative(),
  trinkgeld: z.number().nonnegative().default(0),
  waehrung: z.string().min(1),
  kategorie: z.string().min(1),
  zahlungsmethode: z.string().min(1),
  rechnungsnummer: z.string().default(""),
});

const CSV_HEADER = "id,datum,haendler,betrag,mwst,trinkgeld,waehrung,kategorie,zahlungsmethode,rechnungsnummer,drive_link,eingabe_typ,erstellt_am";

function escapeCsv(v: string | number): string {
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export type ReceiptsDeps = {
  config: Config;
  userRepo: UserRepo;
  gemini: GeminiClient;
  pending: PendingStore;
  failedVoice: FailedVoiceRepo;
  receiptRepo: ReceiptRepo;
};

export function buildReceiptsRouter(deps: ReceiptsDeps) {
  const router = Router();
  router.use(requireAuth);

  router.post("/upload", uploadRateLimit, uploadSingleImage, async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "file required" });
      const userId = req.session.userId!;
      let user = deps.userRepo.getById(userId);
      if (!user?.refreshToken) return res.status(401).json({ error: "Kein Refresh-Token. Bitte erneut anmelden." });

      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      if (!user.driveInboxFolderId) {
        await bootstrapUserDrive(auth, userId, deps.userRepo);
        user = deps.userRepo.getById(userId);
      }
      if (!user?.driveInboxFolderId) return res.status(409).json({ error: "Drive inbox nicht verfügbar" });

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

      const datum = extraction.datum ?? new Date().toISOString().slice(0, 10);
      const haendler = extraction.haendler ?? "Unbekannt";
      const betrag = extraction.betrag ?? 0;

      const isDuplicate = deps.receiptRepo.checkDuplicate(userId, datum, haendler, betrag);
      if (isDuplicate) {
        return res.status(409).json({ error: "Duplikat erkannt: Dieser Beleg wurde bereits importiert." });
      }

      const row = {
        id: uuidv4(),
        datum,
        haendler,
        betrag,
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
      deps.receiptRepo.insert(userId, row);

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post("/confirm", async (req, res, next) => {
    try {
      const parsed = ConfirmBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
      const userId = req.session.userId!;
      const pending = deps.pending.take(userId, parsed.data.pendingId);
      if (!pending) return res.status(404).json({ error: "pending receipt not found or expired" });

      const user = deps.userRepo.getById(userId);
      if (!user?.driveArchiveFolderId) {
        return res.status(409).json({ error: "user drive not bootstrapped" });
      }
      if (!user.refreshToken) {
        return res.status(401).json({ error: "Kein Refresh-Token. Bitte erneut anmelden." });
      }

      const isDuplicate = deps.receiptRepo.checkDuplicate(userId, parsed.data.datum, parsed.data.haendler, parsed.data.betrag);
      if (isDuplicate) {
        return res.status(409).json({ error: "Duplikat erkannt: Dieser Beleg wurde bereits importiert." });
      }

      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      const drive = driveFor(auth);

      let driveLink = "";
      const baseName = `${parsed.data.datum}_${parsed.data.haendler}`.replace(/[^\w.-]/g, "_");
      if (pending.source.kind === "upload") {
        const ext = pending.source.mimeType === "application/pdf" ? "pdf" : pending.source.mimeType.split("/")[1] ?? "bin";
        const r = await archiveBuffer(drive, {
          name: `${baseName}.${ext}`,
          mimeType: pending.source.mimeType,
          buffer: pending.source.buffer,
          archiveRootId: user.driveArchiveFolderId,
          isoDate: parsed.data.datum,
        });
        driveLink = r.driveLink;
      } else if (pending.source.kind === "drive") {
        const r = await archiveExistingFile(drive, pending.source.fileId, user.driveArchiveFolderId, parsed.data.datum);
        driveLink = r.driveLink;
        await setAppProperties(drive, pending.source.fileId, { bm_status: "confirmed" }).catch(() => undefined);
      }

      const row = {
        id: uuidv4(),
        datum: parsed.data.datum,
        haendler: parsed.data.haendler,
        betrag: parsed.data.betrag,
        mwst: parsed.data.mwst,
        trinkgeld: parsed.data.trinkgeld,
        waehrung: parsed.data.waehrung,
        kategorie: parsed.data.kategorie,
        zahlungsmethode: parsed.data.zahlungsmethode,
        rechnungsnummer: parsed.data.rechnungsnummer,
        driveLink,
        eingabeTyp: SOURCE_KIND_TO_EINGABE_TYP[pending.source.kind],
        erstelltAm: new Date().toISOString(),
      };
      deps.receiptRepo.insert(userId, row);
      res.json({ ok: true, row });
    } catch (err) {
      next(err);
    }
  });

  router.get("/pending/:id", (req, res) => {
    const userId = req.session.userId!;
    const entry = deps.pending.peek(userId, req.params.id);
    if (!entry) return res.status(404).json({ error: "pending not found or expired" });
    res.json({
      pendingId: entry.id,
      extraction: entry.extraction,
      mimeType: entry.source && "mimeType" in entry.source ? entry.source.mimeType : null
    });
  });

  router.get("/pending/:id/preview", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const entry = deps.pending.peek(userId, req.params.id);
      if (!entry) return res.status(404).json({ error: "pending not found or expired" });

      const source = entry.source;
      if (source.kind === "upload" || source.kind === "telegram" || source.kind === "email") {
        if ("buffer" in source && "mimeType" in source) {
          res.setHeader("Content-Type", source.mimeType);
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("X-Content-Type-Options", "nosniff");
          res.end(source.buffer);
          return;
        }
      } else if (source.kind === "drive") {
        const user = deps.userRepo.getById(userId);
        if (!user?.refreshToken) return res.status(503).json({ error: "user drive unavailable" });

        const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
        const drive = driveFor(auth);
        const meta = await drive.files.get({ fileId: source.fileId, fields: "mimeType" });
        const mimeType = meta.data.mimeType ?? "application/octet-stream";
        const fileRes = await drive.files.get(
          { fileId: source.fileId, alt: "media" },
          { responseType: "stream" }
        );
        res.setHeader("Content-Type", mimeType);
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Content-Type-Options", "nosniff");
        (fileRes.data as NodeJS.ReadableStream).pipe(res);
        return;
      }

      res.status(400).json({ error: "preview not supported for this source" });
    } catch (err) {
      log.error({ err }, "pending-preview error");
      next(err);
    }
  });

  router.delete("/pending/:id", async (req, res, next) => {
    try {
      const pendingId = req.params.id;
      const userId = req.session.userId!;
      const pending = deps.pending.take(userId, pendingId);

      if (pending) {
        const source = pending.source;
        if (source.kind === "drive") {
          const user = deps.userRepo.getById(userId);
          if (user?.refreshToken) {
            const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
            const drive = driveFor(auth);
            await setAppProperties(drive, source.fileId, { bm_status: "confirmed" }).catch((err) => {
              log.error({ err, fileId: source.fileId }, "failed to set bm_status for pending delete");
            });
          }
        }
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

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

      const datum = extraction.datum ?? new Date().toISOString().slice(0, 10);
      const haendler = extraction.haendler ?? "Unbekannt";
      const betrag = extraction.betrag ?? 0;

      const isDuplicate = deps.receiptRepo.checkDuplicate(userId, datum, haendler, betrag);
      if (isDuplicate) {
        return res.status(409).json({ error: "Duplikat erkannt: Dieser Beleg wurde bereits importiert." });
      }

      const row = {
        id: uuidv4(),
        datum,
        haendler,
        betrag,
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
      deps.receiptRepo.insert(userId, row);

      deps.failedVoice.delete(userId, job.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.get("/duplicate-check", (req, res) => {
    const { haendler, betrag, datum } = req.query;
    if (typeof haendler !== "string" || typeof betrag !== "string" || typeof datum !== "string") {
      return res.status(400).json({ error: "haendler, betrag, datum required" });
    }
    const parsedBetrag = parseFloat(betrag);
    if (isNaN(parsedBetrag)) return res.status(400).json({ error: "betrag must be a number" });

    const userId = req.session.userId!;
    const isDuplicate = deps.receiptRepo.checkDuplicate(userId, datum, haendler, parsedBetrag);
    res.json({ duplicate: isDuplicate ? { datum, haendler, betrag: parsedBetrag } : null });
  });

  router.get("/export/csv", (req, res) => {
    const userId = req.session.userId!;
    const rows = deps.receiptRepo.findAll(userId);
    const lines = rows.map((r) =>
      [r.id, r.datum, r.haendler, r.betrag, r.mwst, r.trinkgeld, r.waehrung,
       r.kategorie, r.zahlungsmethode, r.rechnungsnummer, r.driveLink, r.eingabeTyp, r.erstelltAm]
        .map(escapeCsv)
        .join(",")
    );
    const csv = [CSV_HEADER, ...lines].join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="belege.csv"');
    res.send(csv);
  });

  router.get("/", (req, res) => {
    const userId = req.session.userId!;
    const rows = deps.receiptRepo.findAll(userId);
    res.json({ rows });
  });

  router.put("/:id", (req, res) => {
    const parsed = UpdateBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });

    const userId = req.session.userId!;
    const existing = deps.receiptRepo.findById(userId, req.params.id);
    if (!existing) return res.status(404).json({ error: "receipt not found" });

    const updated = {
      ...existing,
      datum: parsed.data.datum,
      haendler: parsed.data.haendler,
      betrag: parsed.data.betrag,
      mwst: parsed.data.mwst,
      trinkgeld: parsed.data.trinkgeld,
      waehrung: parsed.data.waehrung,
      kategorie: parsed.data.kategorie,
      zahlungsmethode: parsed.data.zahlungsmethode,
      rechnungsnummer: parsed.data.rechnungsnummer,
    };

    const ok = deps.receiptRepo.update(userId, updated);
    if (!ok) return res.status(404).json({ error: "receipt not found" });
    res.json({ ok: true, row: updated });
  });

  router.delete("/:id", (req, res) => {
    const userId = req.session.userId!;
    const ok = deps.receiptRepo.delete(userId, req.params.id);
    if (!ok) return res.status(404).json({ error: "receipt not found" });
    res.json({ ok: true });
  });

  return router;
}
```

- [ ] **Step 3: Run receipts-routes tests**

```bash
cd server && npm test -- receipts-routes
```
Expected: PASS (guard tests still pass; CSV 401 test passes)

- [ ] **Step 4: Commit**

```bash
git add server/src/receipts/routes.ts server/test/receipts-routes.test.ts
git commit -m "feat(receipts): replace Google Sheets with SQLite receiptRepo, add CSV export"
```

---

## Task 6: Update `app.ts` — wire receiptRepo into all routers

**Files:**
- Modify: `server/src/app.ts`

- [ ] **Step 1: Update `app.ts` to create and pass `receiptRepo`**

In `server/src/app.ts`:

1. Add import at the top with other imports:
```typescript
import { createReceiptRepo } from "./receipts/receiptRepo.js";
```

2. Inside `createApp`, after `const failedVoiceRepo = ...`, add:
```typescript
const receiptRepo = createReceiptRepo(deps.db);
```

3. Update the `buildReceiptsRouter` call to include `receiptRepo`:
```typescript
app.use("/api/receipts", buildReceiptsRouter({
  config: deps.config,
  userRepo,
  gemini: deps.gemini,
  pending: deps.pending,
  failedVoice: failedVoiceRepo,
  receiptRepo,
}));
```

4. Update the `buildStatsRouter` call (signature will change in Task 8):
```typescript
app.use("/api/stats", buildStatsRouter(userRepo, receiptRepo));
```

5. Update the `buildDriveRouter` call to add `receiptRepo`:
```typescript
app.use("/api/drive", buildDriveRouter({
  config: deps.config,
  userRepo,
  gemini: deps.gemini,
  pending: deps.pending,
  receiptRepo,
}));
```

6. Update the `buildTelegramRouter` call to add `receiptRepo`:
```typescript
app.use("/api/telegram", buildTelegramRouter({
  config: deps.config,
  userRepo,
  gemini: deps.gemini,
  healthRepo: deps.healthRepo,
  receiptRepo,
}));
```

7. Update `buildSplitsRouter` — after Task 10, the router will only need `db`:
```typescript
app.use("/api/splits", buildSplitsRouter(deps.db));
```

Also update `buildTestApp.ts` helper — no change needed since it calls `createApp`, which now creates receiptRepo from `db` internally.

- [ ] **Step 2: Verify typecheck (will have errors until other tasks are done — that's expected)**

Note: Task 6 introduces intentional type errors in `app.ts` until Tasks 8, 9, 10, 11 are completed. The plan continues in parallel. Run typecheck after Task 11 to verify all errors are resolved.

- [ ] **Step 3: Commit**

```bash
git add server/src/app.ts
git commit -m "refactor(app): wire receiptRepo into receipts, stats, drive, telegram routers"
```

---

## Task 7: Update `drive/routes.ts` — replace Sheets

**Files:**
- Modify: `server/src/drive/routes.ts`

- [ ] **Step 1: Rewrite drive/routes.ts**

Replace the file `server/src/drive/routes.ts` with:

```typescript
import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { GeminiClient } from "../gemini/extract.js";
import type { PendingStore } from "../receipts/pendingStore.js";
import type { ReceiptRepo } from "../receipts/receiptRepo.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { buildOAuth2ClientForRefreshToken } from "../google/client.js";
import { bootstrapUserDrive } from "../google/bootstrap.js";
import { driveFor, listFolderFiles, downloadFile, setAppProperties } from "../google/drive.js";
import { archiveExistingFile } from "../receipts/archive.js";
import { SOURCE_KIND_TO_EINGABE_TYP } from "../receipts/types.js";
import { cleanErrorMessage } from "../gemini/errors.js";

export type DriveRoutesDeps = {
  config: Config;
  userRepo: UserRepo;
  gemini: GeminiClient;
  pending: PendingStore;
  receiptRepo: ReceiptRepo;
};

const SUPPORTED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export function buildDriveRouter(deps: DriveRoutesDeps) {
  const router = Router();
  router.use(requireAuth);

  router.get("/inbox", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      let user = deps.userRepo.getById(userId);
      if (!user?.refreshToken) return res.status(401).json({ error: "Kein Refresh-Token. Bitte erneut anmelden." });
      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      if (!user.driveInboxFolderId) {
        await bootstrapUserDrive(auth, userId, deps.userRepo);
        user = deps.userRepo.getById(userId);
        if (!user?.driveInboxFolderId) return res.json({ files: [] });
      }
      const drive = driveFor(auth);
      const files = await listFolderFiles(drive, user.driveInboxFolderId);
      const enriched = files
        .filter((f) => f.appProperties?.bm_status !== "confirmed")
        .map((f) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          status: f.appProperties?.bm_status ?? "new",
          extracted: f.appProperties?.bm_extracted_json ? JSON.parse(f.appProperties.bm_extracted_json) : null,
          error: f.appProperties?.bm_error ?? null,
        }));
      res.json({ files: enriched });
    } catch (err) {
      console.error("[drive] inbox fetch failed:", err);
      if ((err as any).code === 401 || (err as any).code === 403) {
        return res.status((err as any).code).json({ error: "Google Drive Zugriff verweigert. Bitte erneut anmelden." });
      }
      next(err);
    }
  });

  router.get("/inbox/:fileId/preview", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.refreshToken) return res.status(401).json({ error: "Kein Refresh-Token. Bitte erneut anmelden." });

      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      const drive = driveFor(auth);
      const meta = await drive.files.get({ fileId: req.params.fileId, fields: "mimeType" });
      const mimeType = meta.data.mimeType ?? "application/octet-stream";
      const fileRes = await drive.files.get(
        { fileId: req.params.fileId, alt: "media" },
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

  router.post("/reset", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.refreshToken) return res.status(401).json({ error: "Kein Refresh-Token. Bitte erneut anmelden." });
      deps.userRepo.clearDriveFolderIds(userId);
      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      await bootstrapUserDrive(auth, userId, deps.userRepo);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post("/import/:fileId", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.driveInboxFolderId) return res.status(409).json({ error: "drive not bootstrapped" });

      if (!user.refreshToken) return res.status(401).json({ error: "Kein Refresh-Token. Bitte erneut anmelden." });
      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      const drive = driveFor(auth);
      const files = await listFolderFiles(drive, user.driveInboxFolderId);
      const file = files.find((f) => f.id === req.params.fileId);
      if (!file) return res.status(404).json({ error: "file not in inbox" });
      if (!SUPPORTED.has(file.mimeType)) {
        return res.status(415).json({ error: `unsupported mime: ${file.mimeType}` });
      }

      let extraction;
      try {
        const buffer = await downloadFile(drive, file.id);
        extraction = await deps.gemini.extractFromPhoto({ mimeType: file.mimeType, buffer });
      } catch (err) {
        await setAppProperties(drive, file.id, {
          bm_status: "failed",
          bm_error: cleanErrorMessage(err),
        }).catch(() => undefined);
        throw err;
      }

      const pendingId = deps.pending.put({
        userId,
        source: { kind: "drive", fileId: file.id, mimeType: file.mimeType },
        extraction,
      });
      await setAppProperties(drive, file.id, {
        bm_status: "pending_review",
        bm_extracted_json: JSON.stringify(extraction),
        bm_error: "",
      }).catch(() => undefined);
      res.json({ pendingId, extraction, fileName: file.name, mimeType: file.mimeType });
    } catch (err) {
      next(err);
    }
  });

  const ManualConfirmBody = z.object({
    datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    haendler: z.string().min(1),
    betrag: z.number().nonnegative(),
    mwst: z.number().nonnegative(),
    trinkgeld: z.number().nonnegative().default(0),
    waehrung: z.string().min(1),
    kategorie: z.string().min(1),
    zahlungsmethode: z.string().min(1),
    rechnungsnummer: z.string().default(""),
  });

  router.post("/inbox/:fileId/confirm-manual", async (req, res, next) => {
    try {
      const parsed = ManualConfirmBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });

      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.refreshToken) return res.status(401).json({ error: "Kein Refresh-Token" });
      if (!user.driveArchiveFolderId) {
        return res.status(409).json({ error: "Drive nicht eingerichtet" });
      }

      const isDuplicate = deps.receiptRepo.checkDuplicate(userId, parsed.data.datum, parsed.data.haendler, parsed.data.betrag);
      if (isDuplicate) {
        return res.status(409).json({ error: "Duplikat erkannt: Dieser Beleg wurde bereits importiert." });
      }

      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      const drive = driveFor(auth);

      const { driveLink } = await archiveExistingFile(
        drive,
        req.params.fileId,
        user.driveArchiveFolderId,
        parsed.data.datum,
      );

      const row = {
        id: uuidv4(),
        datum: parsed.data.datum,
        haendler: parsed.data.haendler,
        betrag: parsed.data.betrag,
        mwst: parsed.data.mwst,
        trinkgeld: parsed.data.trinkgeld,
        waehrung: parsed.data.waehrung,
        kategorie: parsed.data.kategorie,
        zahlungsmethode: parsed.data.zahlungsmethode,
        rechnungsnummer: parsed.data.rechnungsnummer,
        driveLink,
        eingabeTyp: SOURCE_KIND_TO_EINGABE_TYP["drive"],
        erstelltAm: new Date().toISOString(),
      };
      deps.receiptRepo.insert(userId, row);

      await setAppProperties(drive, req.params.fileId, { bm_status: "confirmed" }).catch(() => undefined);

      res.json({ ok: true, row });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/inbox/:fileId", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.refreshToken) return res.status(401).json({ error: "Kein Refresh-Token" });

      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      const drive = driveFor(auth);
      await setAppProperties(drive, req.params.fileId, { bm_status: "confirmed" }).catch(() => undefined);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/drive/routes.ts
git commit -m "refactor(drive): replace Google Sheets with SQLite receiptRepo"
```

---

## Task 8: Update `inbox/poller.ts` — replace Sheets

**Files:**
- Modify: `server/src/inbox/poller.ts`

- [ ] **Step 1: Update poller deps type and logic**

Replace the entire `server/src/inbox/poller.ts` file with:

```typescript
import cron from "node-cron";
import { randomUUID } from "node:crypto";
import { logger } from "../logger.js";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { GeminiClient } from "../gemini/extract.js";
import type { HealthRepo } from "../monitoring/repo.js";
import type { ReceiptRepo } from "../receipts/receiptRepo.js";
import { buildOAuth2ClientForRefreshToken } from "../google/client.js";
import { driveFor, listFolderFiles, downloadFile, setAppProperties } from "../google/drive.js";
import { archiveExistingFile } from "../receipts/archive.js";
import { SUPPORTED_MIME_TYPES, SOURCE_KIND_TO_EINGABE_TYP } from "../receipts/types.js";
import { cleanErrorMessage } from "../gemini/errors.js";

export type PollerDeps = {
  config: Config;
  userRepo: UserRepo;
  gemini: GeminiClient;
  healthRepo?: HealthRepo;
  receiptRepo: ReceiptRepo;
};

const log = logger.child({ module: "inbox-poller" });

export function startInboxPoller(deps: PollerDeps): { stop: () => void } {
  log.info("inbox poller started");
  const task = cron.schedule("*/5 * * * * *", () => {
    runOnce(deps)
      .then(({ processed, failed }) => {
        deps.healthRepo?.upsert({
          serviceName: "drive-inbox-poller",
          lastRunAt: Date.now(),
          status: failed > 0 && processed === 0 ? "error" : "ok",
          itemsProcessed: processed,
          itemsFailed: failed,
          lastError: null,
        });
      })
      .catch((err) => {
        log.error({ err }, "poll run failed");
        deps.healthRepo?.upsert({
          serviceName: "drive-inbox-poller",
          lastRunAt: Date.now(),
          status: "error",
          itemsProcessed: 0,
          itemsFailed: 0,
          lastError: String((err as Error).message ?? err).slice(0, 500),
        });
      });
  });
  return {
    stop: () => {
      log.info("inbox poller stopped");
      task.stop();
    },
  };
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
      const files = await listFolderFiles(drive, user.driveInboxFolderId);
      for (const file of files) {
        if (file.appProperties?.bm_status) continue;
        if (!SUPPORTED_MIME_TYPES.has(file.mimeType)) continue;
        try {
          const buffer = await downloadFile(drive, file.id);
          const extraction = await deps.gemini.extractFromPhoto({ mimeType: file.mimeType, buffer });

          const datum = extraction.datum ?? new Date().toISOString().slice(0, 10);
          const haendler = extraction.haendler ?? "Unbekannt";
          const betrag = extraction.betrag ?? 0;

          const isDuplicate = deps.receiptRepo.checkDuplicate(user.id, datum, haendler, betrag);
          if (isDuplicate) {
            throw new Error("Duplikat erkannt: Beleg existiert bereits");
          }

          let driveLink = "";
          if (user.driveArchiveFolderId) {
            try {
              const r = await archiveExistingFile(drive, file.id, user.driveArchiveFolderId, datum);
              driveLink = r.driveLink;
            } catch (archErr) {
              log.warn({ err: archErr, fileId: file.id }, "archive failed, continuing without link");
            }
          }

          deps.receiptRepo.insert(user.id, {
            id: randomUUID(),
            datum,
            haendler,
            betrag,
            mwst: extraction.mwst ?? 0,
            trinkgeld: extraction.trinkgeld ?? 0,
            waehrung: extraction.waehrung ?? "EUR",
            kategorie: extraction.kategorie ?? "Sonstiges",
            zahlungsmethode: extraction.zahlungsmethode ?? "Unbekannt",
            rechnungsnummer: extraction.rechnungsnummer ?? "",
            driveLink,
            eingabeTyp: SOURCE_KIND_TO_EINGABE_TYP["drive"],
            erstelltAm: new Date().toISOString(),
          });

          await setAppProperties(drive, file.id, { bm_status: "confirmed" }).catch(() => undefined);
          log.debug({ fileId: file.id, userId: user.id }, "file processed");
          processed++;
        } catch (err) {
          log.error({ err, fileId: file.id, userId: user.id }, "file processing failed");
          await setAppProperties(drive, file.id, {
            bm_status: "failed",
            bm_error: cleanErrorMessage(err),
          }).catch(() => undefined);
          failed++;
        }
      }
    } catch (err) {
      log.error({ err, userId: user.id }, "user poll failed");
    }
  }
  log.info({ processed, failed }, "run complete");
  return { processed, failed };
}
```

- [ ] **Step 2: Update `server/src/server.ts` to pass receiptRepo to the poller**

Open `server/src/server.ts`. Find where `startInboxPoller` is called and add `receiptRepo` to the deps. Look for the pattern:

```typescript
startInboxPoller({ config, userRepo, gemini, healthRepo })
```

Change to:

```typescript
startInboxPoller({ config, userRepo, gemini, healthRepo, receiptRepo })
```

Also ensure `receiptRepo` is created there: `const receiptRepo = createReceiptRepo(db);` (import from `./receipts/receiptRepo.js`).

- [ ] **Step 3: Commit**

```bash
git add server/src/inbox/poller.ts server/src/server.ts
git commit -m "refactor(poller): replace Google Sheets with SQLite receiptRepo"
```

---

## Task 9: Update `telegram/bot.ts` — replace Sheets

**Files:**
- Modify: `server/src/telegram/bot.ts`

- [ ] **Step 1: Update TelegramBotDeps and remove Sheets call**

In `server/src/telegram/bot.ts`:

1. Replace the import line:
```typescript
import { sheetsFor, appendRow, type ReceiptRow } from "../google/sheets.js";
```
With:
```typescript
import type { ReceiptRepo } from "../receipts/receiptRepo.js";
```

2. Add `receiptRepo: ReceiptRepo` to `TelegramBotDeps`:
```typescript
export type TelegramBotDeps = {
  config: Config;
  userRepo: UserRepo;
  gemini: GeminiClient;
  healthRepo?: HealthRepo;
  receiptRepo: ReceiptRepo;
};
```

3. Replace the entire Sheets block (lines ~128-147 in the original):
```typescript
if (user.refreshToken && user.sheetId) {
  const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
  const sheets = sheetsFor(auth);
  const row: ReceiptRow = { ... };
  await appendRow(sheets, user.sheetId, row);
}
```
With:
```typescript
deps.receiptRepo.insert(user.id, {
  id: randomUUID(),
  datum,
  haendler,
  betrag: extraction.betrag ?? 0,
  mwst: extraction.mwst ?? 0,
  trinkgeld: extraction.trinkgeld ?? 0,
  waehrung: extraction.waehrung ?? "EUR",
  kategorie: extraction.kategorie ?? "Sonstiges",
  zahlungsmethode: extraction.zahlungsmethode ?? "Unbekannt",
  rechnungsnummer: extraction.rechnungsnummer ?? "",
  driveLink,
  eingabeTyp: SOURCE_KIND_TO_EINGABE_TYP["telegram"],
  erstelltAm: new Date().toISOString(),
});
```

4. Remove the now-unused import:
```typescript
import { buildOAuth2ClientForRefreshToken } from "../google/client.js";
```
(Only remove if `buildOAuth2ClientForRefreshToken` is no longer used in the file — check that the archive block at lines ~109-126 still uses it. If yes, keep it.)

- [ ] **Step 2: Commit**

```bash
git add server/src/telegram/bot.ts
git commit -m "refactor(telegram): replace Google Sheets with SQLite receiptRepo"
```

---

## Task 10: Update `stats/routes.ts` — replace Sheets

**Files:**
- Modify: `server/src/stats/routes.ts`

- [ ] **Step 1: Rewrite stats/routes.ts**

Replace the entire file `server/src/stats/routes.ts` with:

```typescript
import { Router } from "express";
import type { UserRepo } from "../auth/userRepo.js";
import type { ReceiptRepo } from "../receipts/receiptRepo.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { computeSummary, computeMonthly, computeCategories, computeTopMerchants, computePaymentMethods } from "./compute.js";

export function buildStatsRouter(userRepo: UserRepo, receiptRepo: ReceiptRepo) {
  const router = Router();
  router.use(requireAuth);

  function loadRows(req: any) {
    const userId = req.session.userId as string;
    return receiptRepo.findAll(userId);
  }

  router.get("/summary", (req, res, next) => {
    try { res.json(computeSummary(loadRows(req))); } catch (e) { next(e); }
  });
  router.get("/monthly", (req, res, next) => {
    try { res.json(computeMonthly(loadRows(req))); } catch (e) { next(e); }
  });
  router.get("/categories", (req, res, next) => {
    try { res.json(computeCategories(loadRows(req))); } catch (e) { next(e); }
  });
  router.get("/top-merchants", (req, res, next) => {
    try { res.json(computeTopMerchants(loadRows(req))); } catch (e) { next(e); }
  });
  router.get("/payment-methods", (req, res, next) => {
    try { res.json(computePaymentMethods(loadRows(req))); } catch (e) { next(e); }
  });

  return router;
}
```

- [ ] **Step 2: Run stats tests**

```bash
cd server && npm test -- stats
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add server/src/stats/routes.ts
git commit -m "refactor(stats): replace Google Sheets with SQLite receiptRepo"
```

---

## Task 11: Update `bootstrap.ts` — remove spreadsheet creation

**Files:**
- Modify: `server/src/google/bootstrap.ts`

- [ ] **Step 1: Remove spreadsheet logic from bootstrapUserDrive**

Replace the entire `server/src/google/bootstrap.ts` with:

```typescript
import type { OAuth2Client } from "google-auth-library";
import { driveFor, findOrCreateFolder } from "./drive.js";
import type { UserRepo } from "../auth/userRepo.js";

const FINANZEN_FOLDER_NAME = "FINANZEN";
const ROOT_FOLDER_NAME = "Beleg-Manager";
const INBOX_FOLDER_NAME = "Belege_Eingang";
const ARCHIVE_FOLDER_NAME = "Archiv";

export async function bootstrapUserDrive(
  auth: OAuth2Client,
  userId: string,
  userRepo: UserRepo
): Promise<void> {
  const existing = userRepo.getById(userId);
  if (existing?.driveRootFolderId && existing.driveInboxFolderId && existing.driveArchiveFolderId) {
    return;
  }

  const drive = driveFor(auth);

  const finanzienId = await findOrCreateFolder(drive, FINANZEN_FOLDER_NAME);
  const rootId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME, finanzienId);
  const inboxId = await findOrCreateFolder(drive, INBOX_FOLDER_NAME, rootId);
  const archiveId = await findOrCreateFolder(drive, ARCHIVE_FOLDER_NAME, rootId);

  userRepo.setDriveAssets(userId, {
    driveRootFolderId: rootId,
    driveInboxFolderId: inboxId,
    driveArchiveFolderId: archiveId,
    sheetId: existing?.sheetId ?? "",
  });
}
```

Note: `sheetId` is kept in `setDriveAssets` call to avoid changing the DB schema or `UserRepo` interface. Passing the existing value (or empty string) is safe — it's no longer used.

- [ ] **Step 2: Commit**

```bash
git add server/src/google/bootstrap.ts
git commit -m "refactor(bootstrap): remove Google Sheets spreadsheet creation"
```

---

## Task 12: Clean up `splits/routes.ts` — remove all Sheets routes

**Files:**
- Modify: `server/src/splits/routes.ts`

The Sheets-based routes (`GET /`, `POST /`, `PATCH /:id/beglichen`, `PATCH /:id/status`, `DELETE /:id`) are obsolete (replaced by `split_requests`). Only the SQLite `PATCH /:id/bank-tx` route remains valid.

- [ ] **Step 1: Replace splits/routes.ts**

Replace the entire file `server/src/splits/routes.ts` with:

```typescript
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import type { Db } from "../db/index.js";

const LinkBankTxBody = z.object({
  bankTxId: z.string().min(1).nullable(),
});

export function buildSplitsRouter(db: Db) {
  const router = Router();
  router.use(requireAuth);

  router.patch("/:id/bank-tx", (req, res, next) => {
    try {
      const parsed = LinkBankTxBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid body" });

      const userId = req.session.userId!;
      const splitId = req.params.id;
      const { bankTxId } = parsed.data;

      if (bankTxId === null) {
        db.prepare("DELETE FROM split_bank_links WHERE split_id = ? AND user_id = ?").run(splitId, userId);
      } else {
        db.prepare(
          "INSERT OR REPLACE INTO split_bank_links (split_id, user_id, bank_tx_id, created_at) VALUES (?, ?, ?, ?)"
        ).run(splitId, userId, bankTxId, Date.now());
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 2: Update `app.ts` to match the new signature**

In `server/src/app.ts`, the `buildSplitsRouter` call should already read:
```typescript
app.use("/api/splits", buildSplitsRouter(deps.db));
```
(This was prepared in Task 6. Verify it matches.)

- [ ] **Step 3: Commit**

```bash
git add server/src/splits/routes.ts
git commit -m "refactor(splits): remove obsolete Google Sheets routes, keep bank-tx link only"
```

---

## Task 13: Delete `sheets.ts` and run full typecheck

**Files:**
- Delete: `server/src/google/sheets.ts`

- [ ] **Step 1: Delete the file**

```bash
cd server && rm src/google/sheets.ts
```
(Windows: `del server\src\google\sheets.ts`)

- [ ] **Step 2: Run full typecheck**

```bash
cd server && npm run typecheck
```
Expected: 0 errors. If there are errors, they point to remaining `sheets.ts` imports — fix them before proceeding.

- [ ] **Step 3: Run all tests**

```bash
cd server && npm test
```
Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: remove Google Sheets integration — SQLite is now the sole receipt store"
```

---

## Task 14: Add CSV export button to the frontend

**Files:**
- Modify: the receipts list page (locate with `grep -r "export/csv\|receipts.*list\|Belege" client/src --include="*.tsx" -l`)

- [ ] **Step 1: Locate the receipts list page**

```bash
cd .. && grep -r "receipts\|Belege" client/src/pages --include="*.tsx" -l
```
The file is likely `client/src/pages/Receipts.tsx` or similar.

- [ ] **Step 2: Add the CSV export button**

In the receipts page component, add a download link in the header/toolbar area alongside existing controls:

```tsx
<a
  href="/api/receipts/export/csv"
  download="belege.csv"
  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
>
  CSV exportieren
</a>
```

Place it near the existing view-mode toggle or filter controls.

- [ ] **Step 3: Start dev server and verify download**

```bash
cd .. && npm run dev
```
Navigate to the receipts page, click "CSV exportieren" and verify the browser downloads `belege.csv`.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Receipts.tsx   # adjust filename as found
git commit -m "feat(ui): add CSV export button on receipts page"
```

---

## Post-Implementation Checklist

- [ ] `npm test` in `server/` — all tests green
- [ ] `npm run typecheck` in `server/` — zero errors
- [ ] `npm run build` in `server/` — clean compile
- [ ] Manual smoke test: confirm a receipt via the web UI and verify it appears in the receipts list
- [ ] Manual smoke test: click CSV export and open the file in Excel/LibreOffice — verify columns match
- [ ] `google/sheets.ts` no longer exists: `ls server/src/google/` shows only `bootstrap.ts`, `client.ts`, `drive.ts`
- [ ] Update `context/progress-tracker.md` with the completed work

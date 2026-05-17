# Anforderungen & Aufteilungen – Unified Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the split (Aufteilung) and request (Anforderung) concepts into one data model and UI, add photo preview, failed-receipt manual entry, and per-person user search in the split dialog.

**Architecture:** All splits are now stored as `split_requests` rows (SQLite). Free-name splits use `free_name TEXT` with a null `to_user_id`. The `/splits` page and route are deleted; `/requests` becomes the single surface with two tabs. The photo upload component gains a client-side image preview. Failed Drive-inbox files gain a manual-entry path.

**Tech Stack:** TypeScript, React, TanStack Query, Express, better-sqlite3, Zod, Tailwind, Radix UI / shadcn

---

## File Map

| Action  | Path |
|---------|------|
| Modify  | `server/src/db/migrations.ts` |
| Modify  | `server/src/split-requests/repo.ts` |
| Modify  | `server/src/split-requests/schema.ts` |
| Modify  | `server/src/split-requests/routes.ts` |
| Modify  | `server/src/drive/routes.ts` |
| Modify  | `server/src/app.ts` |
| Modify  | `client/src/api/splitRequests.ts` |
| Modify  | `client/src/hooks/useSplitRequests.ts` |
| Modify  | `client/src/components/receipts/SplitDialog.tsx` |
| Modify  | `client/src/components/receipts/ReceiptTable.tsx` |
| Modify  | `client/src/components/receipts/FailedReceiptsSection.tsx` |
| Modify  | `client/src/components/bank/SplitBankTxDialog.tsx` |
| Create  | `client/src/components/split-requests/MyAufteilungenList.tsx` |
| Modify  | `client/src/pages/Requests.tsx` |
| Modify  | `client/src/components/AppShell.tsx` |
| Modify  | `client/src/App.tsx` |
| Modify  | `client/src/components/upload/PhotoUpload.tsx` |
| Delete  | `client/src/pages/Splits.tsx` |
| Delete  | `client/src/api/splits.ts` |

---

## Task 1: Photo Preview in Upload

**Files:**
- Modify: `client/src/components/upload/PhotoUpload.tsx`

- [ ] **Step 1: Add preview state and object-URL management**

Replace the entire file content:

```tsx
import { useRef, useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { receiptsApi } from "@/api/receipts";

export function PhotoUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [file]);

  function handleFile(f: File | undefined) {
    setFile(f ?? null);
  }

  async function submit() {
    if (!file) return toast({ title: "Bitte eine Datei wählen." });
    setBusy(true);
    try {
      await receiptsApi.upload(file, transcript || undefined);
      toast({ title: "Beleg wird verarbeitet", description: "Er erscheint in Kürze unter Belege." });
      setFile(null);
      setTranscript("");
    } catch (e) {
      toast({ title: "Upload fehlgeschlagen", description: String((e as Error).message) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Foto hochladen</CardTitle>
        <CardDescription>JPG, PNG, WEBP oder PDF, bis 10 MB.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="rounded-md border-2 border-dashed p-8 text-center cursor-pointer hover:bg-secondary/30 space-y-3"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Vorschau"
              className="max-h-48 mx-auto rounded-lg object-contain"
            />
          ) : file?.type === "application/pdf" ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <FileText className="h-10 w-10" />
              <span className="text-sm font-medium">{file.name}</span>
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {file ? file.name : "Datei hier hineinziehen oder klicken zum Auswählen"}
          </p>
          <Input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="transcript-photo">Optionaler Sprachkontext</Label>
          <Input
            id="transcript-photo"
            placeholder="z.B. Geschäftsessen mit Kunde XYZ"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
          />
        </div>
        <Button onClick={submit} disabled={!file || busy} className="w-full">
          {busy ? "Verarbeite..." : "Verarbeiten"}
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/upload/PhotoUpload.tsx
git commit -m "feat(upload): add image preview before submitting"
```

---

## Task 2: DB Migration – extend split_requests, add failed_uploads

**Files:**
- Modify: `server/src/db/migrations.ts`

- [ ] **Step 1: Add migration guards and new tables**

Find the end of `runMigrations` (after the `service_health` CREATE TABLE block) and append:

```ts
  // Extend split_requests: nullable to_user_id, free_name, receipt_sqlite_id, nullable receipt_id
  // Guard: only run if free_name column is absent
  const srCols = db.prepare("PRAGMA table_info(split_requests)").all() as Array<{ name: string }>;
  if (!srCols.some((c) => c.name === "free_name")) {
    db.exec(`
      CREATE TABLE split_requests_new (
        id                TEXT PRIMARY KEY,
        from_user_id      TEXT NOT NULL,
        to_user_id        TEXT,
        free_name         TEXT,
        receipt_id        TEXT,
        receipt_sqlite_id TEXT,
        receipt_meta      TEXT NOT NULL,
        betrag            REAL NOT NULL,
        nachricht         TEXT NOT NULL DEFAULT '',
        status            TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','accepted','rejected','cancelled')),
        created_at        INTEGER NOT NULL,
        updated_at        INTEGER NOT NULL,
        FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (to_user_id)   REFERENCES users(id) ON DELETE CASCADE
      );
      INSERT INTO split_requests_new
        (id, from_user_id, to_user_id, free_name, receipt_id, receipt_sqlite_id,
         receipt_meta, betrag, nachricht, status, created_at, updated_at)
      SELECT id, from_user_id, to_user_id, NULL, receipt_id, NULL,
             receipt_meta, betrag, nachricht, status, created_at, updated_at
      FROM split_requests;
      DROP TABLE split_requests;
      ALTER TABLE split_requests_new RENAME TO split_requests;
      CREATE INDEX IF NOT EXISTS idx_split_req_to   ON split_requests(to_user_id, status);
      CREATE INDEX IF NOT EXISTS idx_split_req_from ON split_requests(from_user_id, status);
    `);
  }

  // failed_uploads: for direct-upload receipts where Gemini failed
  db.exec(`
    CREATE TABLE IF NOT EXISTS failed_uploads (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      filename    TEXT NOT NULL,
      filepath    TEXT NOT NULL,
      error       TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
```

- [ ] **Step 2: Commit**

```bash
git add server/src/db/migrations.ts
git commit -m "feat(db): extend split_requests (free_name, receipt_sqlite_id, nullable to_user_id, receipt_id)"
```

---

## Task 3: Server – split_requests repo, schema, routes

**Files:**
- Modify: `server/src/split-requests/repo.ts`
- Modify: `server/src/split-requests/schema.ts`
- Modify: `server/src/split-requests/routes.ts`

- [ ] **Step 1: Update repo.ts – types + all queries**

Replace full file content of `server/src/split-requests/repo.ts`:

```ts
import { v4 as uuidv4 } from "uuid";
import type { Db } from "../db/index.js";

export type SplitRequestStatus = "pending" | "accepted" | "rejected" | "cancelled";

export type ReceiptMeta = {
  haendler: string;
  datum: string;
  gesamtbetrag: number;
  waehrung: string;
};

export type SplitRequestRow = {
  id: string;
  fromUserId: string;
  toUserId: string | null;
  freeName: string | null;
  receiptId: string | null;
  receiptSqliteId: string | null;
  receiptMeta: ReceiptMeta;
  betrag: number;
  nachricht: string;
  status: SplitRequestStatus;
  createdAt: number;
  updatedAt: number;
};

type RawRow = Omit<SplitRequestRow, "receiptMeta"> & { receiptMeta: string };

const SELECT_COLS = `
  id,
  from_user_id      AS fromUserId,
  to_user_id        AS toUserId,
  free_name         AS freeName,
  receipt_id        AS receiptId,
  receipt_sqlite_id AS receiptSqliteId,
  receipt_meta      AS receiptMeta,
  betrag, nachricht, status,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

function parseRow(raw: RawRow): SplitRequestRow {
  return { ...raw, receiptMeta: JSON.parse(raw.receiptMeta) as ReceiptMeta };
}

export function createSplitRequestRepo(db: Db) {
  return {
    create(input: {
      fromUserId: string;
      toUserId?: string | null;
      freeName?: string | null;
      receiptId?: string | null;
      receiptSqliteId?: string | null;
      receiptMeta: ReceiptMeta;
      betrag: number;
      nachricht: string;
    }): SplitRequestRow {
      const now = Date.now();
      const id = uuidv4();
      db.prepare(
        `INSERT INTO split_requests
          (id, from_user_id, to_user_id, free_name, receipt_id, receipt_sqlite_id,
           receipt_meta, betrag, nachricht, status, created_at, updated_at)
         VALUES (@id, @fromUserId, @toUserId, @freeName, @receiptId, @receiptSqliteId,
                 @receiptMeta, @betrag, @nachricht, 'pending', @now, @now)`
      ).run({
        id,
        fromUserId: input.fromUserId,
        toUserId: input.toUserId ?? null,
        freeName: input.freeName ?? null,
        receiptId: input.receiptId ?? null,
        receiptSqliteId: input.receiptSqliteId ?? null,
        receiptMeta: JSON.stringify(input.receiptMeta),
        betrag: input.betrag,
        nachricht: input.nachricht,
        now,
      });
      return this.getById(id)!;
    },

    getById(id: string): SplitRequestRow | undefined {
      const raw = db.prepare(`SELECT ${SELECT_COLS} FROM split_requests WHERE id = ?`).get(id) as RawRow | undefined;
      return raw ? parseRow(raw) : undefined;
    },

    listIncoming(toUserId: string): SplitRequestRow[] {
      const rows = db.prepare(
        `SELECT ${SELECT_COLS} FROM split_requests WHERE to_user_id = ? ORDER BY created_at DESC`
      ).all(toUserId) as RawRow[];
      return rows.map(parseRow);
    },

    listOutgoing(fromUserId: string): SplitRequestRow[] {
      const rows = db.prepare(
        `SELECT ${SELECT_COLS} FROM split_requests WHERE from_user_id = ? ORDER BY created_at DESC`
      ).all(fromUserId) as RawRow[];
      return rows.map(parseRow);
    },

    listKnownPersons(fromUserId: string): string[] {
      const rows = db.prepare(
        `SELECT DISTINCT free_name FROM split_requests
         WHERE from_user_id = ? AND free_name IS NOT NULL
         ORDER BY free_name`
      ).all(fromUserId) as Array<{ free_name: string }>;
      return rows.map((r) => r.free_name);
    },

    updateStatus(id: string, status: SplitRequestStatus): boolean {
      const result = db.prepare(
        `UPDATE split_requests SET status = ?, updated_at = ? WHERE id = ?`
      ).run(status, Date.now(), id);
      return result.changes > 0;
    },

    delete(id: string): boolean {
      const result = db.prepare("DELETE FROM split_requests WHERE id = ?").run(id);
      return result.changes > 0;
    },

    countPendingIncoming(toUserId: string): number {
      const row = db.prepare(
        `SELECT COUNT(*) AS cnt FROM split_requests WHERE to_user_id = ? AND status = 'pending'`
      ).get(toUserId) as { cnt: number };
      return row.cnt;
    },
  };
}

export type SplitRequestRepo = ReturnType<typeof createSplitRequestRepo>;
```

- [ ] **Step 2: Update schema.ts**

Replace full file content of `server/src/split-requests/schema.ts`:

```ts
import { z } from "zod";

export const CreateSplitRequestBody = z.object({
  toUserId: z.string().min(1).optional(),
  freeName: z.string().min(1).max(200).optional(),
  receiptId: z.string().min(1).optional(),
  receiptSqliteId: z.string().min(1).optional(),
  receiptMeta: z.object({
    haendler: z.string().min(1),
    datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    gesamtbetrag: z.number().positive(),
    waehrung: z.string().min(1).default("EUR"),
  }),
  betrag: z.number().positive(),
  nachricht: z.string().max(500).default(""),
}).refine(
  (d) => d.toUserId || d.freeName,
  { message: "Either toUserId or freeName is required" }
);

export const UpdateStatusBody = z.object({
  status: z.enum(["pending", "accepted", "rejected", "cancelled"]),
  grund: z.string().max(500).optional(),
});

export const LinkBankTxBody = z.object({
  bankTxId: z.string().min(1).nullable(),
});

export const SearchQuerySchema = z.object({
  q: z.string().min(2).max(100),
});
```

- [ ] **Step 3: Update routes.ts**

Replace full file content of `server/src/split-requests/routes.ts`:

```ts
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/requireAuth.js";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { Db } from "../db/index.js";
import type { SplitRequestRepo } from "./repo.js";
import { CreateSplitRequestBody, UpdateStatusBody, LinkBankTxBody } from "./schema.js";
import { driveFor } from "../google/drive.js";
import { buildOAuth2ClientForRefreshToken } from "../google/client.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "split-requests" });

const createLimit = rateLimit({
  windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => (req.session?.userId ?? req.ip) as string,
});

const previewLimit = rateLimit({
  windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => (req.session?.userId ?? req.ip) as string,
});

export function buildSplitRequestsRouter(
  config: Config,
  userRepo: UserRepo,
  splitRequestRepo: SplitRequestRepo,
  db: Db,
) {
  const router = Router();
  router.use(requireAuth);

  router.get("/incoming", (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const requests = splitRequestRepo.listIncoming(userId);
      const bankLinks = db
        .prepare("SELECT split_id, bank_tx_id FROM split_bank_links WHERE user_id = ?")
        .all(userId) as Array<{ split_id: string; bank_tx_id: string }>;
      const linkMap = new Map(bankLinks.map((l) => [l.split_id, l.bank_tx_id]));
      const enriched = requests.map((r) => ({
        ...r,
        fromUser: (() => {
          const u = userRepo.getById(r.fromUserId);
          return u ? { id: u.id, name: u.name, email: u.email } : null;
        })(),
        linkedBankTxId: linkMap.get(r.id) ?? null,
        linkedBankTxSource: linkMap.has(r.id) ? "manual" : null,
      }));
      res.json({ requests: enriched });
    } catch (err) { next(err); }
  });

  router.get("/outgoing", (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const requests = splitRequestRepo.listOutgoing(userId);
      const bankLinks = db
        .prepare("SELECT split_id, bank_tx_id FROM split_bank_links WHERE user_id = ?")
        .all(userId) as Array<{ split_id: string; bank_tx_id: string }>;
      const linkMap = new Map(bankLinks.map((l) => [l.split_id, l.bank_tx_id]));
      const enriched = requests.map((r) => ({
        ...r,
        toUser: r.toUserId ? (() => {
          const u = userRepo.getById(r.toUserId!);
          return u ? { id: u.id, name: u.name, email: u.email } : null;
        })() : null,
        linkedBankTxId: linkMap.get(r.id) ?? null,
        linkedBankTxSource: linkMap.has(r.id) ? ("manual" as const) : null,
      }));
      res.json({ requests: enriched });
    } catch (err) { next(err); }
  });

  router.get("/pending-count", (req, res, next) => {
    try {
      const count = splitRequestRepo.countPendingIncoming(req.session.userId!);
      res.json({ count });
    } catch (err) { next(err); }
  });

  router.get("/known-persons", (req, res, next) => {
    try {
      const persons = splitRequestRepo.listKnownPersons(req.session.userId!);
      res.json({ persons });
    } catch (err) { next(err); }
  });

  router.get("/:id/receipt-preview", previewLimit, async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const splitReq = splitRequestRepo.getById(req.params.id!);
      if (!splitReq) return res.status(404).json({ error: "not found" });
      if (splitReq.toUserId !== userId) return res.status(403).json({ error: "forbidden" });
      if (!["pending", "accepted"].includes(splitReq.status)) {
        return res.status(403).json({ error: "forbidden" });
      }
      if (!splitReq.receiptId) return res.status(404).json({ error: "no receipt file attached" });

      const fromUser = userRepo.getById(splitReq.fromUserId);
      if (!fromUser?.refreshToken) return res.status(503).json({ error: "source user unavailable" });

      const auth = buildOAuth2ClientForRefreshToken(config.google, fromUser.refreshToken);
      const drive = driveFor(auth);
      const meta = await drive.files.get({ fileId: splitReq.receiptId, fields: "mimeType" });
      const mimeType = meta.data.mimeType ?? "application/octet-stream";
      const fileRes = await drive.files.get(
        { fileId: splitReq.receiptId, alt: "media" },
        { responseType: "stream" }
      );
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      (fileRes.data as NodeJS.ReadableStream).pipe(res);
    } catch (err) {
      log.error({ err }, "receipt-preview error");
      next(err);
    }
  });

  router.post("/", createLimit, async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const parsed = CreateSplitRequestBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
      }

      const { toUserId, freeName, receiptId, receiptSqliteId, receiptMeta, betrag, nachricht } = parsed.data;

      if (toUserId === userId) {
        return res.status(400).json({ error: "cannot request from yourself" });
      }

      if (toUserId) {
        const toUser = userRepo.getById(toUserId);
        if (!toUser) return res.status(404).json({ error: "target user not found" });

        if (receiptId) {
          const fromUser = userRepo.getById(userId);
          if (!fromUser?.refreshToken) return res.status(409).json({ error: "drive not configured" });
          try {
            const auth = buildOAuth2ClientForRefreshToken(config.google, fromUser.refreshToken);
            const drive = driveFor(auth);
            await drive.files.get({ fileId: receiptId, fields: "id" });
          } catch {
            return res.status(400).json({ error: "receipt not accessible" });
          }
        }
      }

      const splitReq = splitRequestRepo.create({
        fromUserId: userId,
        toUserId: toUserId ?? null,
        freeName: freeName ?? null,
        receiptId: receiptId ?? null,
        receiptSqliteId: receiptSqliteId ?? null,
        receiptMeta,
        betrag,
        nachricht,
      });

      res.status(201).json({ request: splitReq });
    } catch (err) { next(err); }
  });

  router.patch("/:id/status", (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const parsed = UpdateStatusBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });

      const splitReq = splitRequestRepo.getById(req.params.id!);
      if (!splitReq) return res.status(404).json({ error: "not found" });
      const { status } = parsed.data;

      const isFreeName = splitReq.toUserId === null;

      if (isFreeName) {
        // Free-name splits: only the creator controls status
        if (splitReq.fromUserId !== userId) return res.status(403).json({ error: "forbidden" });
      } else {
        if ((status === "accepted" || status === "rejected") && splitReq.toUserId !== userId) {
          return res.status(403).json({ error: "forbidden" });
        }
        if (status === "cancelled" && splitReq.fromUserId !== userId) {
          return res.status(403).json({ error: "forbidden" });
        }
      }

      if (splitReq.status !== "pending" && !isFreeName) {
        return res.status(409).json({ error: "request already resolved" });
      }

      splitRequestRepo.updateStatus(req.params.id!, status);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  router.patch("/:id/bank-tx", (req, res, next) => {
    try {
      const parsed = LinkBankTxBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid body" });

      const userId = req.session.userId!;
      const splitReq = splitRequestRepo.getById(req.params.id!);
      if (!splitReq) return res.status(404).json({ error: "not found" });
      if (splitReq.fromUserId !== userId) return res.status(403).json({ error: "forbidden" });

      const { bankTxId } = parsed.data;
      if (bankTxId === null) {
        db.prepare("DELETE FROM split_bank_links WHERE split_id = ? AND user_id = ?").run(req.params.id, userId);
      } else {
        db.prepare(
          "INSERT OR REPLACE INTO split_bank_links (split_id, user_id, bank_tx_id, created_at) VALUES (?, ?, ?, ?)"
        ).run(req.params.id, userId, bankTxId, Date.now());
      }
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  router.delete("/:id", (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const splitReq = splitRequestRepo.getById(req.params.id!);
      if (!splitReq) return res.status(404).json({ error: "not found" });
      if (splitReq.fromUserId !== userId) return res.status(403).json({ error: "forbidden" });
      const isFreeName = splitReq.toUserId === null;
      if (!isFreeName && !["cancelled", "rejected"].includes(splitReq.status)) {
        return res.status(409).json({ error: "can only delete cancelled or rejected requests" });
      }
      splitRequestRepo.delete(req.params.id!);
      db.prepare("DELETE FROM split_bank_links WHERE split_id = ? AND user_id = ?").run(req.params.id, userId);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
}
```

- [ ] **Step 4: Update app.ts to pass `db` to the split-requests router**

In `server/src/app.ts`, find the line:
```ts
app.use("/api/split-requests", buildSplitRequestsRouter(deps.config, userRepo, splitRequestRepo));
```
Replace with:
```ts
app.use("/api/split-requests", buildSplitRequestsRouter(deps.config, userRepo, splitRequestRepo, deps.db));
```

- [ ] **Step 5: Commit**

```bash
git add server/src/split-requests/repo.ts server/src/split-requests/schema.ts \
        server/src/split-requests/routes.ts server/src/app.ts
git commit -m "feat(split-requests): support free-name splits, bank-tx linking, known-persons endpoint"
```

---

## Task 4: Server – Drive manual confirm endpoint (Feature 2)

**Files:**
- Modify: `server/src/drive/routes.ts`

- [ ] **Step 1: Add required imports and extend DriveRoutesDeps**

At the top of `server/src/drive/routes.ts`, add these imports (after existing ones):

```ts
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { sheetsFor, appendRow, SHEET_TAB_NAME, type ReceiptRow } from "../google/sheets.js";
import { archiveExistingFile } from "../receipts/archive.js";
import { SOURCE_KIND_TO_EINGABE_TYP } from "../receipts/types.js";
import { setAppProperties } from "../google/drive.js";
```

The existing `setAppProperties` import is already there — confirm and skip duplicates.

Update `DriveRoutesDeps` to add `userRepo`:

The type already has `userRepo`. No change needed.

- [ ] **Step 2: Add the manual-confirm route before `return router`**

In `server/src/drive/routes.ts`, add before `return router;`:

```ts
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
      if (!user.driveArchiveFolderId || !user.sheetId) {
        return res.status(409).json({ error: "Drive nicht eingerichtet" });
      }

      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      const drive = driveFor(auth);

      const { driveLink } = await archiveExistingFile(
        drive,
        req.params.fileId,
        user.driveArchiveFolderId,
        parsed.data.datum,
      );

      const sheets = sheetsFor(auth);
      const row: ReceiptRow = {
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
      await appendRow(sheets, user.sheetId, row);

      await setAppProperties(drive, req.params.fileId, { bm_status: "confirmed" }).catch(() => undefined);

      res.json({ ok: true, row });
    } catch (err) {
      next(err);
    }
  });
```

- [ ] **Step 3: Commit**

```bash
git add server/src/drive/routes.ts
git commit -m "feat(drive): add manual-confirm endpoint for failed inbox items"
```

---

## Task 5: Client – API types and hooks update

**Files:**
- Modify: `client/src/api/splitRequests.ts`
- Modify: `client/src/hooks/useSplitRequests.ts`

- [ ] **Step 1: Replace splitRequests.ts**

```ts
import { api } from "./client";

export type SplitRequestStatus = "pending" | "accepted" | "rejected" | "cancelled";

export type ReceiptMeta = {
  haendler: string;
  datum: string;
  gesamtbetrag: number;
  waehrung: string;
};

export type UserInfo = { id: string; name: string; email: string };

export type SplitRequest = {
  id: string;
  fromUserId: string;
  toUserId: string | null;
  freeName: string | null;
  receiptId: string | null;
  receiptSqliteId: string | null;
  receiptMeta: ReceiptMeta;
  betrag: number;
  nachricht: string;
  status: SplitRequestStatus;
  createdAt: number;
  updatedAt: number;
  linkedBankTxId: string | null;
  linkedBankTxSource: "manual" | "receipt" | null;
};

export type IncomingRequest = SplitRequest & { fromUser: UserInfo | null };
export type OutgoingRequest = SplitRequest & { toUser: UserInfo | null };

export const splitRequestsApi = {
  incoming: () => api.get<{ requests: IncomingRequest[] }>("/api/split-requests/incoming"),

  outgoing: () => api.get<{ requests: OutgoingRequest[] }>("/api/split-requests/outgoing"),

  pendingCount: () => api.get<{ count: number }>("/api/split-requests/pending-count"),

  knownPersons: () => api.get<{ persons: string[] }>("/api/split-requests/known-persons"),

  create: (payload: {
    toUserId?: string;
    freeName?: string;
    receiptId?: string;
    receiptSqliteId?: string;
    receiptMeta: ReceiptMeta;
    betrag: number;
    nachricht: string;
  }) => api.post<{ request: SplitRequest }>("/api/split-requests", payload),

  updateStatus: (id: string, status: "pending" | "accepted" | "rejected" | "cancelled") =>
    api.patch<{ ok: true }>(`/api/split-requests/${id}/status`, { status }),

  linkBankTx: (id: string, bankTxId: string | null) =>
    api.patch<{ ok: true }>(`/api/split-requests/${id}/bank-tx`, { bankTxId }),

  delete: (id: string) => api.delete<{ ok: true }>(`/api/split-requests/${id}`),

  receiptPreviewUrl: (id: string) => `/api/split-requests/${id}/receipt-preview`,
};
```

- [ ] **Step 2: Update useSplitRequests.ts – add useKnownPersons hook**

Add to end of `client/src/hooks/useSplitRequests.ts`:

```ts
export function useKnownPersons() {
  return useQuery({
    queryKey: ["split-requests", "known-persons"],
    queryFn: () => splitRequestsApi.knownPersons(),
    select: (data) => data.persons,
  });
}
```

Also update `useCreateRequest` to use the new payload type (it already calls `splitRequestsApi.create` which now accepts the wider type — no change needed).

- [ ] **Step 3: Commit**

```bash
git add client/src/api/splitRequests.ts client/src/hooks/useSplitRequests.ts
git commit -m "feat(client): update splitRequests API types for free-name support + knownPersons hook"
```

---

## Task 6: Client – SplitDialog with user search + free-name picker

**Files:**
- Modify: `client/src/components/receipts/SplitDialog.tsx`

- [ ] **Step 1: Replace SplitDialog.tsx**

```tsx
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, X, User } from "lucide-react";
import { splitRequestsApi } from "@/api/splitRequests";
import { useUserSearch } from "@/hooks/useUserSearch";
import { useKnownPersons } from "@/hooks/useSplitRequests";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/formatters";
import type { ReceiptRow } from "@/types/receipt";
import type { OutgoingRequest, UserInfo } from "@/api/splitRequests";

interface SplitDialogProps {
  receipt: ReceiptRow | null;
  existingRequests: OutgoingRequest[];
  onClose: () => void;
}

type Item = {
  id?: string;
  toUser: UserInfo | null;
  freeName: string;
  betrag: string;
  searchInput: string;
  showDropdown: boolean;
};

function extractDriveFileId(driveLink: string): string | null {
  return driveLink.match(/\/file\/d\/([^/?]+)/)?.[1] ?? null;
}

function PersonPicker({
  item,
  index,
  knownPersons,
  onChange,
}: {
  item: Item;
  index: number;
  knownPersons: string[];
  onChange: (idx: number, updates: Partial<Item>) => void;
}) {
  const { users, setInputValue } = useUserSearch();

  function handleInput(val: string) {
    onChange(index, { searchInput: val, showDropdown: true });
    setInputValue(val);
    if (!val) onChange(index, { toUser: null, freeName: "" });
  }

  function selectUser(u: UserInfo) {
    onChange(index, { toUser: u, freeName: "", searchInput: u.name, showDropdown: false });
    setInputValue("");
  }

  function selectFreeName(name: string) {
    onChange(index, { toUser: null, freeName: name, searchInput: name, showDropdown: false });
    setInputValue("");
  }

  function clearSelection() {
    onChange(index, { toUser: null, freeName: "", searchInput: "", showDropdown: false });
    setInputValue("");
  }

  const hasSelection = item.toUser !== null || item.freeName.length > 0;
  const showList = item.showDropdown && item.searchInput.length >= 1;
  const listId = `known-persons-${index}`;

  return (
    <div className="relative flex-1">
      {hasSelection ? (
        <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-muted/30 text-sm">
          {item.toUser ? (
            <User className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          ) : null}
          <span className="flex-1 truncate font-medium">
            {item.toUser ? item.toUser.name : item.freeName}
          </span>
          {item.toUser && (
            <span className="text-xs text-muted-foreground truncate max-w-[80px]">{item.toUser.email}</span>
          )}
          <button onClick={clearSelection} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <>
          {knownPersons.length > 0 && (
            <datalist id={listId}>
              {knownPersons.map((p) => <option key={p} value={p} />)}
            </datalist>
          )}
          <Input
            list={knownPersons.length > 0 ? listId : undefined}
            placeholder="Name oder E-Mail"
            value={item.searchInput}
            onChange={(e) => handleInput(e.target.value)}
            onFocus={() => onChange(index, { showDropdown: true })}
            onBlur={() => setTimeout(() => onChange(index, { showDropdown: false }), 150)}
            className="h-9"
          />
          {showList && (
            <div className="absolute top-10 left-0 z-50 w-full rounded-lg border border-border bg-card shadow-lg max-h-44 overflow-y-auto">
              {users.map((u) => (
                <button
                  key={u.id}
                  className="w-full flex flex-col items-start px-3 py-2 text-left hover:bg-muted/50 transition-colors text-sm"
                  onMouseDown={() => selectUser(u)}
                >
                  <span className="font-medium">{u.name}</span>
                  <span className="text-xs text-muted-foreground">{u.email}</span>
                </button>
              ))}
              {item.searchInput.length >= 1 && (
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors text-sm border-t border-border/60"
                  onMouseDown={() => selectFreeName(item.searchInput)}
                >
                  <span className="text-muted-foreground">Als freien Namen:</span>
                  <span className="font-medium">„{item.searchInput}"</span>
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function SplitDialog({ receipt, existingRequests, onClose }: SplitDialogProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: knownPersons = [] } = useKnownPersons();
  const [items, setItems] = useState<Item[]>([{ toUser: null, freeName: "", betrag: "", searchInput: "", showDropdown: false }]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!receipt) return;
    const existing = existingRequests.filter((r) => r.receiptSqliteId === receipt.id);
    setItems(
      existing.length > 0
        ? existing.map((r) => ({
            id: r.id,
            toUser: r.toUserId && r.toUserId !== null ? ({ id: r.toUserId, name: r.receiptMeta.haendler, email: "" } as UserInfo) : null,
            freeName: r.freeName ?? "",
            betrag: String(r.betrag),
            searchInput: r.freeName ?? r.toUserId ?? "",
            showDropdown: false,
          }))
        : [{ toUser: null, freeName: "", betrag: "", searchInput: "", showDropdown: false }]
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt?.id]);

  if (!receipt) return null;

  const totalAssigned = items.reduce((s, i) => s + (parseFloat(i.betrag) || 0), 0);
  const remaining = Math.round((receipt.betrag - totalAssigned) * 100) / 100;

  function addItem() {
    setItems((prev) => [...prev, { toUser: null, freeName: "", betrag: "", searchInput: "", showDropdown: false }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, updates: Partial<Item>) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...updates } : item)));
  }

  async function handleSubmit() {
    if (!receipt) return;
    const valid = items.filter((i) => (i.toUser || i.freeName.trim()) && parseFloat(i.betrag) > 0);
    if (valid.length === 0) return;

    setBusy(true);
    try {
      const existing = existingRequests.filter((r) => r.receiptSqliteId === receipt.id);
      if (existing.length > 0) {
        await Promise.all(existing.map((r) => splitRequestsApi.delete(r.id)));
      }

      const driveFileId = extractDriveFileId(receipt.driveLink);

      await Promise.all(
        valid.map((i) =>
          splitRequestsApi.create({
            toUserId: i.toUser?.id,
            freeName: i.toUser ? undefined : i.freeName.trim(),
            receiptId: i.toUser && driveFileId ? driveFileId : undefined,
            receiptSqliteId: receipt.id,
            receiptMeta: {
              haendler: receipt.haendler,
              datum: receipt.datum,
              gesamtbetrag: receipt.betrag,
              waehrung: receipt.waehrung,
            },
            betrag: parseFloat(i.betrag),
            nachricht: "",
          })
        )
      );

      qc.invalidateQueries({ queryKey: ["split-requests"] });
      toast({ title: "Aufteilung gespeichert" });
      onClose();
    } catch {
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const existingForReceipt = existingRequests.filter((r) => r.receiptSqliteId === receipt.id);

  return (
    <Dialog open={receipt !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Beleg aufteilen</DialogTitle>
          <DialogDescription>
            {receipt.haendler} · {formatCurrency(receipt.betrag, receipt.waehrung)} · {receipt.datum}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {items.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <PersonPicker item={item} index={idx} knownPersons={knownPersons} onChange={updateItem} />
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="Betrag"
                value={item.betrag}
                onChange={(e) => updateItem(idx, { betrag: e.target.value })}
                className="w-28 h-9 flex-shrink-0"
              />
              {items.length > 1 && (
                <Button variant="ghost" size="icon" onClick={() => removeItem(idx)} className="h-9 w-9 flex-shrink-0">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}

          <Button variant="ghost" size="sm" onClick={addItem} className="gap-1.5 text-muted-foreground">
            <Plus className="h-4 w-4" /> Person hinzufügen
          </Button>

          <div className={`text-xs font-medium mt-1 ${remaining < -0.01 ? "text-destructive" : remaining > 0.01 ? "text-muted-foreground" : "text-green-600 dark:text-green-400"}`}>
            {remaining > 0.01
              ? `Noch nicht aufgeteilt: ${formatCurrency(remaining, receipt.waehrung)}`
              : remaining < -0.01
              ? `Summe überschreitet Betrag um ${formatCurrency(-remaining, receipt.waehrung)}`
              : "Vollständig aufgeteilt ✓"}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} className="flex-1" disabled={busy}>Abbrechen</Button>
          <Button
            onClick={handleSubmit}
            disabled={busy || items.every((i) => (!i.toUser && !i.freeName.trim()) || !parseFloat(i.betrag))}
            className="flex-1"
          >
            {busy ? "Speichern…" : existingForReceipt.length > 0 ? "Aufteilung aktualisieren" : "Aufteilung speichern"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/receipts/SplitDialog.tsx
git commit -m "feat(split): replace person input with user-search + free-name picker"
```

---

## Task 7: Client – ReceiptTable uses outgoing split_requests for split indicator

**Files:**
- Modify: `client/src/components/receipts/ReceiptTable.tsx`

- [ ] **Step 1: Replace splitsApi usage with splitRequestsApi**

In `client/src/components/receipts/ReceiptTable.tsx`:

1. Remove `import { splitsApi } from "@/api/splits";`
2. Add `import { splitRequestsApi } from "@/api/splitRequests";`
3. Add `import type { OutgoingRequest } from "@/api/splitRequests";`

4. Replace these two lines:
```ts
const { data: splitsData } = useQuery({ queryKey: ["splits"], queryFn: () => splitsApi.list() });
// ...
const allSplits = splitsData?.splits ?? [];
const splitReceiptIds = useMemo(() => new Set(allSplits.map((s) => s.receiptId)), [allSplits]);
const knownPersons = useMemo(() => [...new Set(allSplits.map((s) => s.person))].sort(), [allSplits]);
```
With:
```ts
const { data: outgoingData } = useQuery({ queryKey: ["split-requests", "outgoing"], queryFn: () => splitRequestsApi.outgoing() });
// ...
const outgoingRequests: OutgoingRequest[] = outgoingData?.requests ?? [];
const splitReceiptIds = useMemo(() => new Set(outgoingRequests.filter((r) => r.receiptSqliteId).map((r) => r.receiptSqliteId!)), [outgoingRequests]);
```

5. Remove the `knownPersons` useMemo (now comes from hook in SplitDialog).

6. Update `SplitDialog` props in the JSX at line ~510:
```tsx
<SplitDialog receipt={splitRow} existingRequests={outgoingRequests} onClose={() => setSplitRow(null)} />
```

7. Remove the `KontobewegungZuordnenDialog` `onAssigned` callback that invalidates `["splits"]`:
```ts
onAssigned={() => {
  setLinkTxRow(null);
  qc.invalidateQueries({ queryKey: ["bank-transactions"] });
  // remove: qc.invalidateQueries({ queryKey: ["splits"] });
}}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/receipts/ReceiptTable.tsx
git commit -m "refactor(receipts): use split-requests outgoing for split indicator"
```

---

## Task 8: Client – SplitBankTxDialog adapted for split_requests

**Files:**
- Modify: `client/src/components/bank/SplitBankTxDialog.tsx`

- [ ] **Step 1: Replace SplitBankTxDialog.tsx to use splitRequestsApi**

```tsx
import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ArrowDownLeft } from "lucide-react";
import { bankApi } from "@/api/bank";
import { splitRequestsApi } from "@/api/splitRequests";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import type { OutgoingRequest } from "@/api/splitRequests";

type Props = {
  split: OutgoingRequest | null;
  onClose: () => void;
  onLinked: () => void;
};

export function SplitBankTxDialog({ split, onClose, onLinked }: Props) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (split) setSearch("");
  }, [split?.id]);

  const { data, isLoading } = useQuery({
    queryKey: ["bank-transactions"],
    queryFn: () => bankApi.listTransactions(),
    enabled: split !== null,
  });

  const candidates = useMemo(() => {
    const txs = (data?.transactions ?? []).filter((tx) => tx.betrag > 0 && tx.matchStatus !== "ignored");
    if (!search.trim()) return txs;
    const q = search.toLowerCase();
    return txs.filter(
      (tx) => tx.haendler.toLowerCase().includes(q) || tx.verwendungszweck.toLowerCase().includes(q)
    );
  }, [data, search]);

  async function handleLink(bankTxId: string) {
    if (!split) return;
    setBusy(true);
    try {
      await splitRequestsApi.linkBankTx(split.id, bankTxId);
      toast({ title: "Kontobewegung verknüpft" });
      onClose();
      onLinked();
    } catch {
      toast({ title: "Verknüpfung fehlgeschlagen", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlink() {
    if (!split) return;
    setBusy(true);
    try {
      await splitRequestsApi.linkBankTx(split.id, null);
      toast({ title: "Verknüpfung aufgehoben" });
      onClose();
      onLinked();
    } catch {
      toast({ title: "Fehler", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const personName = split?.freeName ?? split?.toUser?.name ?? "Unbekannt";
  const waehrung = split?.receiptMeta.waehrung ?? "EUR";

  return (
    <Dialog open={split !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Kontobewegung verknüpfen</DialogTitle>
          {split && (
            <DialogDescription>
              <span className="font-medium text-foreground">{personName}</span>
              {" schuldet "}
              <span className="font-medium text-foreground">{formatCurrency(split.betrag, waehrung)}</span>
            </DialogDescription>
          )}
        </DialogHeader>

        {split?.linkedBankTxSource === "manual" && (() => {
          const linkedTx = (data?.transactions ?? []).find((tx) => tx.id === split.linkedBankTxId);
          if (!linkedTx) return null;
          return (
            <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20 px-4 py-3">
              <ArrowDownLeft className="h-4 w-4 mt-0.5 flex-shrink-0 text-green-600" />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Verknüpfte Rückzahlung</p>
                <p className="font-medium text-sm">{linkedTx.haendler}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateIso(linkedTx.buchungsdatum)} · <span className="text-green-600 font-medium">{formatCurrency(linkedTx.betrag)}</span>
                </p>
              </div>
            </div>
          );
        })()}

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Händler oder Verwendungszweck suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <div className="max-h-64 overflow-y-auto rounded-md border border-border">
          {isLoading ? (
            <div className="p-3 space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : candidates.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">Keine positiven Kontobewegungen gefunden.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Datum</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Auftraggeber</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Betrag</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((tx) => (
                  <tr key={tx.id} className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${tx.id === split?.linkedBankTxId ? "bg-green-50 dark:bg-green-950/20" : ""}`}>
                    <td className="px-3 py-2 text-muted-foreground">{formatDateIso(tx.buchungsdatum)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium leading-tight">{tx.haendler}</div>
                      {tx.verwendungszweck && <div className="text-xs text-muted-foreground truncate max-w-[160px]">{tx.verwendungszweck}</div>}
                    </td>
                    <td className="px-3 py-2 text-right"><span className="text-green-600 font-medium">{formatCurrency(tx.betrag)}</span></td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" disabled={busy} variant={tx.id === split?.linkedBankTxId ? "outline" : "default"} onClick={() => handleLink(tx.id)}>
                        {tx.id === split?.linkedBankTxId ? "Erneut zuordnen" : "Zuordnen"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
          {split?.linkedBankTxSource === "manual" && (
            <Button variant="ghost" className="text-destructive hover:text-destructive px-0 text-sm" disabled={busy} onClick={handleUnlink}>
              Verknüpfung aufheben
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} className="sm:ml-auto">Abbrechen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/bank/SplitBankTxDialog.tsx
git commit -m "refactor(bank): SplitBankTxDialog uses split-requests API"
```

---

## Task 9: Client – MyAufteilungenList component

**Files:**
- Create: `client/src/components/split-requests/MyAufteilungenList.tsx`

- [ ] **Step 1: Create MyAufteilungenList.tsx**

```tsx
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { splitRequestsApi } from "@/api/splitRequests";
import { bankApi } from "@/api/bank";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Link2, ArrowLeftRight, User } from "lucide-react";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import { SplitBankTxDialog } from "@/components/bank/SplitBankTxDialog";
import type { OutgoingRequest, SplitRequestStatus } from "@/api/splitRequests";

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending:    { label: "Offen",           cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  accepted:   { label: "Zugesagt",        cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  rejected:   { label: "Abgelehnt",       cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  cancelled:  { label: "Ohne Verrechnung", cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
  ausgeglichen: { label: "Ausgeglichen",  cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
};

type DisplayStatus = SplitRequestStatus | "ausgeglichen";

function getDisplayStatus(r: OutgoingRequest): DisplayStatus {
  if (r.linkedBankTxId) return "ausgeglichen";
  return r.status;
}

function isClosed(r: OutgoingRequest) {
  return !!r.linkedBankTxId || r.status === "cancelled" || r.status === "rejected";
}

function StatusBadge({ status }: { status: DisplayStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${cfg.cls}`}>
      {status === "ausgeglichen" && <ArrowLeftRight className="h-3 w-3" />}
      {cfg.label}
    </span>
  );
}

export function MyAufteilungenList() {
  const { data, isLoading } = useQuery({
    queryKey: ["split-requests", "outgoing"],
    queryFn: () => splitRequestsApi.outgoing(),
  });
  const { data: bankData } = useQuery({
    queryKey: ["bank-transactions"],
    queryFn: () => bankApi.listTransactions(),
  });
  const qc = useQueryClient();
  const { toast } = useToast();
  const [linkSplit, setLinkSplit] = useState<OutgoingRequest | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const requests = data?.requests ?? [];

  const txMap = useMemo(() => {
    const m = new Map<string, { haendler: string; buchungsdatum: string; betrag: number }>();
    for (const tx of bankData?.transactions ?? []) m.set(tx.id, tx);
    return m;
  }, [bankData]);

  const byGroup = useMemo(() => {
    const map = new Map<string, OutgoingRequest[]>();
    for (const r of requests) {
      const key = r.receiptSqliteId ?? `${r.receiptMeta.haendler}|${r.receiptMeta.datum}`;
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.createdAt - b.createdAt);
    return map;
  }, [requests]);

  const { activeGroups, closedGroups } = useMemo(() => {
    const active: [string, OutgoingRequest[]][] = [];
    const closed: [string, OutgoingRequest[]][] = [];
    for (const entry of byGroup.entries()) {
      const [key, items] = entry;
      if (items.every(isClosed)) closed.push([key, items]);
      else active.push([key, items]);
    }
    return { activeGroups: active, closedGroups: closed };
  }, [byGroup]);

  const totalOpen = requests.filter((r) => !isClosed(r)).reduce((s, r) => s + r.betrag, 0);
  const totalClosed = requests.filter(isClosed).reduce((s, r) => s + r.betrag, 0);

  async function handleStatusChange(r: OutgoingRequest, status: SplitRequestStatus) {
    setBusyId(r.id);
    try {
      await splitRequestsApi.updateStatus(r.id, status);
      qc.invalidateQueries({ queryKey: ["split-requests"] });
    } catch {
      toast({ title: "Fehler beim Aktualisieren", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(r: OutgoingRequest) {
    try {
      await splitRequestsApi.delete(r.id);
      qc.invalidateQueries({ queryKey: ["split-requests"] });
      toast({ title: "Eintrag gelöscht" });
    } catch {
      toast({ title: "Fehler beim Löschen", variant: "destructive" });
    }
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  if (byGroup.size === 0) {
    return (
      <div className="rounded-xl border border-border bg-muted/20 p-10 text-center text-muted-foreground text-sm">
        Noch keine Aufteilungen. Teile Belege in der Belegliste auf.
      </div>
    );
  }

  function renderGroup(items: OutgoingRequest[], closed: boolean) {
    const first = items[0]!;
    const openCount = items.filter((r) => !isClosed(r)).length;
    const isFreeName = first.toUserId === null;

    return (
      <div className={`rounded-xl border border-border bg-card overflow-hidden ${closed ? "opacity-70" : ""}`}>
        <div className={`px-5 py-4 flex items-center justify-between border-b border-border ${closed ? "bg-muted/10" : "bg-muted/20"}`}>
          <div>
            <p className="font-semibold">{first.receiptMeta.haendler}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatDateIso(first.receiptMeta.datum)} · Gesamt {formatCurrency(first.receiptMeta.gesamtbetrag, first.receiptMeta.waehrung)}
            </p>
          </div>
          <div className="text-right">
            {closed ? (
              <span className="text-xs font-medium text-muted-foreground">Alle abgeschlossen</span>
            ) : (
              <span className="text-xs font-medium text-amber-600">{openCount} offen</span>
            )}
          </div>
        </div>

        <div className="divide-y divide-border">
          {items.map((r) => {
            const ds = getDisplayStatus(r);
            const isAusgeglichen = ds === "ausgeglichen";
            const linkedTx = r.linkedBankTxId ? txMap.get(r.linkedBankTxId) : undefined;
            const personName = r.freeName ?? r.toUser?.name ?? "Unbekannt";
            const canDelete = isFreeName || r.status === "cancelled" || r.status === "rejected";

            return (
              <div key={r.id} className={`px-5 py-3 flex items-start gap-3 transition-colors ${isClosed(r) ? "opacity-60" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.toUser && <User className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
                    <span className="font-medium">{personName}</span>
                    {r.toUser && <span className="text-xs text-muted-foreground">{r.toUser.email}</span>}
                    <StatusBadge status={ds} />
                  </div>
                  {linkedTx && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <ArrowLeftRight className="h-3 w-3 inline mr-1" />
                      {linkedTx.haendler} · {formatDateIso(linkedTx.buchungsdatum)} · {formatCurrency(linkedTx.betrag)}
                    </p>
                  )}
                </div>

                <span className="font-bold flex-shrink-0 text-sm pt-0.5">
                  {formatCurrency(r.betrag, r.receiptMeta.waehrung)}
                </span>

                {!isAusgeglichen && isFreeName && (
                  <div className="flex-shrink-0">
                    <Select
                      value={r.status}
                      onValueChange={(v) => handleStatusChange(r, v as SplitRequestStatus)}
                      disabled={busyId === r.id}
                    >
                      <SelectTrigger className="h-7 w-36 text-xs px-2 py-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Offen</SelectItem>
                        <SelectItem value="accepted">Zugesagt</SelectItem>
                        <SelectItem value="cancelled">Ohne Verrechnung</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 ${r.linkedBankTxId ? "text-green-600 hover:text-green-700" : "text-muted-foreground hover:text-foreground"}`}
                    title={r.linkedBankTxId ? "Kontobewegung ändern" : "Kontobewegung zuordnen"}
                    onClick={() => setLinkSplit(r)}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                  </Button>
                  {canDelete && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(r)}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {requests.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-card p-4 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Offen</p>
            <p className="text-2xl font-bold text-amber-600">{formatCurrency(totalOpen)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Abgeschlossen</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalClosed)}</p>
          </div>
        </div>
      )}

      {activeGroups.map(([key, items]) => (
        <div key={key}>{renderGroup(items, false)}</div>
      ))}

      {closedGroups.length > 0 && (
        <>
          {activeGroups.length > 0 && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex-1 border-t border-border" />
              <span className="font-medium uppercase tracking-wider">Abgeschlossen</span>
              <div className="flex-1 border-t border-border" />
            </div>
          )}
          {closedGroups.map(([key, items]) => (
            <div key={key}>{renderGroup(items, true)}</div>
          ))}
        </>
      )}

      <SplitBankTxDialog
        split={linkSplit}
        onClose={() => setLinkSplit(null)}
        onLinked={() => {
          setLinkSplit(null);
          qc.invalidateQueries({ queryKey: ["split-requests"] });
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/split-requests/MyAufteilungenList.tsx
git commit -m "feat(split-requests): add MyAufteilungenList component for outgoing splits"
```

---

## Task 10: Client – RequestsPage restructure + navigation cleanup

**Files:**
- Modify: `client/src/pages/Requests.tsx`
- Modify: `client/src/components/AppShell.tsx`
- Modify: `client/src/App.tsx`
- Delete: `client/src/pages/Splits.tsx`
- Delete: `client/src/api/splits.ts`

- [ ] **Step 1: Replace Requests.tsx with two-tab layout**

```tsx
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { IncomingList } from "@/components/split-requests/IncomingList";
import { MyAufteilungenList } from "@/components/split-requests/MyAufteilungenList";
import { CreateRequestDialog } from "@/components/split-requests/CreateRequestDialog";
import { usePendingCount } from "@/hooks/useSplitRequests";

export function RequestsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const pendingCount = usePendingCount().data ?? 0;

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Anforderungen</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
            Aufteilungen und Anforderungen von und an andere Nutzer
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="flex items-center gap-2">
          <Plus size={16} />
          Neue Anforderung
        </Button>
      </div>
      <Tabs defaultValue="aufteilungen">
        <TabsList>
          <TabsTrigger value="aufteilungen">Meine Aufteilungen</TabsTrigger>
          <TabsTrigger value="incoming" className="flex items-center gap-2">
            Eingehend
            {pendingCount > 0 && (
              <span className="ml-1 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="aufteilungen" className="mt-4">
          <MyAufteilungenList />
        </TabsContent>
        <TabsContent value="incoming" className="mt-4">
          <IncomingList />
        </TabsContent>
      </Tabs>
      <CreateRequestDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 2: Update AppShell.tsx navigation**

In `client/src/components/AppShell.tsx`:

1. Remove the `SplitSquareHorizontal` icon import (or keep if used elsewhere).
2. In `navItems`, remove the `/splits` entry:
```ts
// Remove:
{ to: "/splits",   label: "Aufteilungen", icon: SplitSquareHorizontal },
```

3. In `moreItems`, remove the `/splits` entry:
```ts
// Remove:
{ to: "/splits",        label: "Aufteilungen",  icon: SplitSquareHorizontal },
```

4. In `PAGE_TITLES`, remove `/splits`:
```ts
// Remove:
"/splits":    "Aufteilungen",
```

- [ ] **Step 3: Update App.tsx – remove /splits route**

In `client/src/App.tsx`:

Remove import:
```ts
import { SplitsPage } from "@/pages/Splits";
```

Remove route:
```tsx
<Route path="/splits" element={<SplitsPage />} />
```

- [ ] **Step 4: Delete old files**

```bash
rm client/src/pages/Splits.tsx
rm client/src/api/splits.ts
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(nav): merge Aufteilungen into Anforderungen, remove /splits route"
```

---

## Task 11: Client – FailedReceiptsSection with manual entry for Drive items

**Files:**
- Modify: `client/src/components/receipts/FailedReceiptsSection.tsx`

- [ ] **Step 1: Add manual-confirm dialog to failed Drive items**

Replace full file content:

```tsx
import { AlertTriangle, RefreshCw, FileText, Mic, PenLine } from "lucide-react";
import { useFailedVoiceJobs, useRetryVoiceJob } from "@/hooks/useFailedVoiceJobs";
import { useDriveInbox } from "@/hooks/useDriveInbox";
import { driveApi } from "@/api/drive";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReceiptForm } from "./ReceiptForm";
import { api } from "@/api/client";
import type { DriveInboxFile } from "@/types/receipt";
import type { ReceiptFormValues } from "@/lib/validators";

function ManualEntryDialog({
  file,
  onClose,
}: {
  file: DriveInboxFile | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function handleSubmit(values: ReceiptFormValues) {
    if (!file) return;
    setBusy(true);
    try {
      await api.post(`/api/drive/inbox/${file.id}/confirm-manual`, {
        ...values,
        betrag: Number(values.betrag),
        mwst: Number(values.mwst),
        trinkgeld: Number(values.trinkgeld ?? 0),
      });
      qc.invalidateQueries({ queryKey: ["driveInbox"] });
      qc.invalidateQueries({ queryKey: ["receipts"] });
      toast({ title: "Beleg manuell erfasst" });
      onClose();
    } catch (e) {
      toast({ title: "Fehler", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={file !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Beleg manuell erfassen — {file?.name}</DialogTitle>
        </DialogHeader>
        <ReceiptForm
          initial={{
            datum: new Date().toISOString().slice(0, 10),
            haendler: "",
            betrag: 0,
            mwst: 0,
            trinkgeld: 0,
            waehrung: "EUR",
            kategorie: "Sonstiges",
            zahlungsmethode: "Unbekannt",
            rechnungsnummer: "",
          }}
          busy={busy}
          onSubmit={handleSubmit}
          submitLabel="Beleg speichern"
        />
      </DialogContent>
    </Dialog>
  );
}

export function FailedReceiptsSection() {
  const { data: voiceData } = useFailedVoiceJobs();
  const { data: inboxData } = useDriveInbox();
  const retryVoice = useRetryVoiceJob();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [retryingDrive, setRetryingDrive] = useState<string | null>(null);
  const [manualFile, setManualFile] = useState<DriveInboxFile | null>(null);

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
    <>
      <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <span className="text-sm font-semibold text-red-700 dark:text-red-400">
            Fehlgeschlagene Belege ({total})
          </span>
        </div>

        <div className="space-y-2">
          {failedDrive.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-white dark:bg-white/5 px-3 py-2.5 border border-red-100 dark:border-red-900/30"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-red-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{f.name}</p>
                  <p className="text-xs text-red-500/70">Drive-Verarbeitung fehlgeschlagen</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setManualFile(f)}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors",
                    "bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-400"
                  )}
                >
                  <PenLine className="h-3 w-3" />
                  Manuell
                </button>
                <button
                  onClick={() => retryDrive(f.id)}
                  disabled={retryingDrive === f.id}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors",
                    "bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400"
                  )}
                >
                  <RefreshCw className={cn("h-3 w-3", retryingDrive === f.id && "animate-spin")} />
                  Erneut
                </button>
              </div>
            </div>
          ))}

          {failedVoice.map((j) => (
            <div
              key={j.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-white dark:bg-white/5 px-3 py-2.5 border border-red-100 dark:border-red-900/30"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Mic className="h-4 w-4 text-red-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{j.transcript}</p>
                  <p className="text-xs text-red-500/70">{j.error}</p>
                </div>
              </div>
              <button
                onClick={() =>
                  retryVoice.mutate(j.id, {
                    onSuccess: () => toast({ title: "Beleg gespeichert" }),
                    onError: (e) => toast({ title: "Fehler", description: String((e as Error).message) }),
                  })
                }
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

      <ManualEntryDialog file={manualFile} onClose={() => setManualFile(null)} />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/receipts/FailedReceiptsSection.tsx
git commit -m "feat(receipts): add manual entry option for failed Drive inbox items"
```

---

## Task 12: Update progress tracker

**Files:**
- Modify: `context/progress-tracker.md`

- [ ] **Step 1: Update progress tracker**

Update `context/progress-tracker.md` to reflect the completed features:
- Add to Completed: "Unified Aufteilung=Anforderung data model; split_requests extended with free_name, receipt_sqlite_id, nullable to_user_id. /splits page removed; /requests is now the single surface with Meine Aufteilungen + Eingehend tabs. SplitDialog enhanced with user-search + free-name picker. Photo preview added to upload. Manual entry path added for failed Drive inbox items."
- Add Architecture Decision: "split_requests to_user_id is now nullable; free_name TEXT stores non-app-user person names; receipt_sqlite_id TEXT links to the local receipts row. Bank-tx linking moved from splits router to split-requests router. All new splits created via POST /api/split-requests."

- [ ] **Step 2: Commit**

```bash
git add context/progress-tracker.md
git commit -m "docs: update progress tracker after unified Anforderungen implementation"
```

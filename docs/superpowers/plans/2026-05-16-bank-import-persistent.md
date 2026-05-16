# Persistenter ING-CSV-Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Kontoabgleich feature with persistent encrypted storage, duplicate detection with detail list, date-range + monthly filtering (client-side), granular deletion (single row + time range), and removal of the bulk-clear button.

**Architecture:** A new `crypto.ts` handles AES-256-GCM field-level encryption for `haendler` and `verwendungszweck` using `BANK_ENCRYPTION_KEY` from `.env`. The repo gains app-layer dedup checking, filter methods, and targeted delete. Two new DELETE API endpoints replace the old clear-all. The frontend adds filter controls, a duplicates display, inline row deletion, and a range-delete dialog — all within the existing `Kontoabgleich.tsx`.

**Tech Stack:** Node.js `crypto` (built-in), better-sqlite3, Zod, React 18, TanStack Query, Vitest, Lucide icons

**Spec:** `docs/superpowers/specs/2026-05-16-bank-import-persistent-design.md`

---

## File Map

| Action | File |
|--------|------|
| Create | `server/src/bank/crypto.ts` |
| Create | `server/test/bank-crypto.test.ts` |
| Modify | `server/src/bank/transactionRepo.ts` |
| Create | `server/test/bank-repo.test.ts` |
| Modify | `server/src/bank/routes.ts` |
| Modify | `client/src/types/bank.ts` |
| Modify | `client/src/api/bank.ts` |
| Modify | `client/src/pages/Kontoabgleich.tsx` |

---

## Task 1: AES-256-GCM Crypto Utility

**Files:**
- Create: `server/src/bank/crypto.ts`
- Create: `server/test/bank-crypto.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/test/bank-crypto.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encrypt, decrypt } from "../src/bank/crypto.js";

const VALID_KEY = "a".repeat(64); // 32 bytes as hex

describe("bank crypto", () => {
  beforeEach(() => {
    process.env.BANK_ENCRYPTION_KEY = VALID_KEY;
  });

  afterEach(() => {
    delete process.env.BANK_ENCRYPTION_KEY;
  });

  it("encrypt then decrypt returns the original plaintext", () => {
    const plaintext = "Edeka Stuttgart";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("encrypting the same plaintext twice produces different ciphertext (random IV)", () => {
    const a = encrypt("Aldi Süd");
    const b = encrypt("Aldi Süd");
    expect(a).not.toBe(b);
  });

  it("encrypt returns plaintext unchanged when BANK_ENCRYPTION_KEY is not set", () => {
    delete process.env.BANK_ENCRYPTION_KEY;
    expect(encrypt("Aldi")).toBe("Aldi");
  });

  it("decrypt returns value unchanged when BANK_ENCRYPTION_KEY is not set", () => {
    delete process.env.BANK_ENCRYPTION_KEY;
    expect(decrypt("Aldi")).toBe("Aldi");
  });

  it("decrypt returns input unchanged for plaintext alt-data (no colon separator)", () => {
    // Simulate a legacy row that was stored before encryption was introduced
    expect(decrypt("Rewe GmbH")).toBe("Rewe GmbH");
  });

  it("decrypt returns input unchanged for corrupted ciphertext", () => {
    const corrupted = "aGVsbG8=:d29ybGQ=:AAAA"; // wrong auth tag length
    const result = decrypt(corrupted);
    // Should not throw; returns the raw input
    expect(typeof result).toBe("string");
  });

  it("handles empty string round-trip", () => {
    expect(decrypt(encrypt(""))).toBe("");
  });

  it("handles unicode characters round-trip", () => {
    const text = "Café München GmbH & Co. KG";
    expect(decrypt(encrypt(text))).toBe(text);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd server && npx vitest run test/bank-crypto.test.ts --reporter=verbose
```

Expected: `Error: Cannot find module` or similar — module does not exist yet.

- [ ] **Step 3: Implement `server/src/bank/crypto.ts`**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm" as const;
const SEP = ":";

function getKey(): Buffer | null {
  const raw = process.env.BANK_ENCRYPTION_KEY;
  if (!raw) return null;
  const buf = Buffer.from(raw, raw.length === 64 ? "hex" : "base64");
  return buf.length === 32 ? buf : null;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(SEP);
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  if (!key) return ciphertext;
  try {
    const parts = ciphertext.split(SEP);
    if (parts.length !== 3) return ciphertext;
    const [ivB64, authTagB64, dataB64] = parts as [string, string, string];
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(data).toString("utf8") + decipher.final("utf8");
  } catch {
    return ciphertext;
  }
}
```

- [ ] **Step 4: Run tests — expect all to pass**

```bash
cd server && npx vitest run test/bank-crypto.test.ts --reporter=verbose
```

Expected: `✓ 8 tests pass`

- [ ] **Step 5: Commit**

```bash
cd server && git add src/bank/crypto.ts test/bank-crypto.test.ts && git commit -m "feat(bank): add AES-256-GCM field encryption utility"
```

---

## Task 2: Repository — Encryption, Dedup Keys, Filter, Targeted Delete

**Files:**
- Modify: `server/src/bank/transactionRepo.ts`
- Create: `server/test/bank-repo.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/test/bank-repo.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openDatabase } from "../src/db/index.js";
import { runMigrations } from "../src/db/migrations.js";
import { createTransactionRepo, NotFoundError } from "../src/bank/transactionRepo.js";
import type { Db } from "../src/db/index.js";

const KEY = "b".repeat(64);
let db: Db;
let repo: ReturnType<typeof createTransactionRepo>;

beforeEach(() => {
  process.env.BANK_ENCRYPTION_KEY = KEY;
  db = openDatabase(":memory:");
  runMigrations(db);
  repo = createTransactionRepo(db);
});

afterEach(() => {
  delete process.env.BANK_ENCRYPTION_KEY;
});

const ROW = {
  id: "tx-1",
  buchungsdatum: "2026-04-10",
  betrag: -42.5,
  haendler: "Edeka",
  verwendungszweck: "Einkauf",
  matchStatus: "unmatched" as const,
  matchedReceiptId: null,
  matchConfidence: null,
};

describe("insertMany + listByUser: encryption roundtrip", () => {
  it("decrypts haendler and verwendungszweck on read-back", () => {
    repo.insertMany("user-1", [ROW]);
    const [tx] = repo.listByUser("user-1");
    expect(tx!.haendler).toBe("Edeka");
    expect(tx!.verwendungszweck).toBe("Einkauf");
  });

  it("stores ciphertext (not plaintext) in the DB column", () => {
    repo.insertMany("user-1", [ROW]);
    const raw = db
      .prepare("SELECT haendler FROM bank_transactions WHERE id = ?")
      .get("tx-1") as { haendler: string };
    expect(raw.haendler).not.toBe("Edeka");
    expect(raw.haendler).toContain(":");
  });
});

describe("getDeduplicateKeys", () => {
  it("returns a set containing the key for an existing transaction", () => {
    repo.insertMany("user-1", [ROW]);
    const keys = repo.getDeduplicateKeys("user-1");
    expect(keys.has("2026-04-10|-42.5|Edeka")).toBe(true);
  });

  it("returns empty set when user has no transactions", () => {
    const keys = repo.getDeduplicateKeys("no-such-user");
    expect(keys.size).toBe(0);
  });
});

describe("listByUser filter", () => {
  beforeEach(() => {
    repo.insertMany("user-1", [
      { ...ROW, id: "tx-a", buchungsdatum: "2026-03-15" },
      { ...ROW, id: "tx-b", buchungsdatum: "2026-04-10" },
      { ...ROW, id: "tx-c", buchungsdatum: "2026-05-01" },
    ]);
  });

  it("returns all rows when no filter is given", () => {
    expect(repo.listByUser("user-1")).toHaveLength(3);
  });

  it("filters by from date (inclusive)", () => {
    const rows = repo.listByUser("user-1", { from: "2026-04-01" });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain("tx-b");
    expect(ids).toContain("tx-c");
    expect(ids).not.toContain("tx-a");
  });

  it("filters by to date (inclusive)", () => {
    const rows = repo.listByUser("user-1", { to: "2026-04-30" });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain("tx-a");
    expect(ids).toContain("tx-b");
    expect(ids).not.toContain("tx-c");
  });

  it("filters by from and to together", () => {
    const rows = repo.listByUser("user-1", { from: "2026-04-01", to: "2026-04-30" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("tx-b");
  });
});

describe("deleteById", () => {
  it("deletes a transaction owned by the user", () => {
    repo.insertMany("user-1", [ROW]);
    repo.deleteById("tx-1", "user-1");
    expect(repo.listByUser("user-1")).toHaveLength(0);
  });

  it("throws NotFoundError for unknown id", () => {
    expect(() => repo.deleteById("no-such-id", "user-1")).toThrow(NotFoundError);
  });

  it("throws NotFoundError when id belongs to a different user", () => {
    repo.insertMany("user-1", [ROW]);
    expect(() => repo.deleteById("tx-1", "user-2")).toThrow(NotFoundError);
  });
});

describe("deleteByRange + countByRange", () => {
  beforeEach(() => {
    repo.insertMany("user-1", [
      { ...ROW, id: "tx-a", buchungsdatum: "2026-03-15" },
      { ...ROW, id: "tx-b", buchungsdatum: "2026-04-10" },
      { ...ROW, id: "tx-c", buchungsdatum: "2026-04-20" },
      { ...ROW, id: "tx-d", buchungsdatum: "2026-05-01" },
    ]);
  });

  it("countByRange returns the correct count", () => {
    expect(repo.countByRange("user-1", "2026-04-01", "2026-04-30")).toBe(2);
  });

  it("deleteByRange removes only rows in the range", () => {
    const deleted = repo.deleteByRange("user-1", "2026-04-01", "2026-04-30");
    expect(deleted).toBe(2);
    const remaining = repo.listByUser("user-1").map((r) => r.id);
    expect(remaining).toContain("tx-a");
    expect(remaining).toContain("tx-d");
    expect(remaining).not.toContain("tx-b");
    expect(remaining).not.toContain("tx-c");
  });

  it("deleteByRange does not touch rows of another user", () => {
    repo.insertMany("user-2", [{ ...ROW, id: "tx-other", buchungsdatum: "2026-04-15" }]);
    repo.deleteByRange("user-1", "2026-04-01", "2026-04-30");
    expect(repo.listByUser("user-2")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd server && npx vitest run test/bank-repo.test.ts --reporter=verbose
```

Expected: multiple failures — missing `getDeduplicateKeys`, `deleteById`, `deleteByRange`, `countByRange`, encryption not happening.

- [ ] **Step 3: Rewrite `server/src/bank/transactionRepo.ts`**

Replace the entire file with:

```ts
import type { Db } from "../db/index.js";
import { encrypt, decrypt } from "./crypto.js";

export class NotFoundError extends Error {}

export type BankTransaction = {
  id: string;
  userId: string;
  buchungsdatum: string;
  betrag: number;
  haendler: string;
  verwendungszweck: string;
  matchStatus: "unmatched" | "matched" | "ignored";
  matchedReceiptId: string | null;
  matchConfidence: "high" | "medium" | "low" | "manual" | null;
  importedAt: number;
};

type DbRow = {
  id: string;
  user_id: string;
  buchungsdatum: string;
  betrag: number;
  haendler: string;
  verwendungszweck: string;
  match_status: "unmatched" | "matched" | "ignored";
  matched_receipt_id: string | null;
  match_confidence: "high" | "medium" | "low" | "manual" | null;
  imported_at: number;
};

function rowToTransaction(row: DbRow): BankTransaction {
  return {
    id: row.id,
    userId: row.user_id,
    buchungsdatum: row.buchungsdatum,
    betrag: row.betrag,
    haendler: decrypt(row.haendler),
    verwendungszweck: decrypt(row.verwendungszweck),
    matchStatus: row.match_status,
    matchedReceiptId: row.matched_receipt_id,
    matchConfidence: row.match_confidence,
    importedAt: row.imported_at,
  };
}

const SELECT_COLS = `id, user_id, buchungsdatum, betrag, haendler, verwendungszweck,
                     match_status, matched_receipt_id, match_confidence, imported_at`;

export function createTransactionRepo(db: Db) {
  return {
    insertMany(userId: string, rows: Omit<BankTransaction, "importedAt" | "userId">[]): void {
      const stmt = db.prepare(
        `INSERT OR IGNORE INTO bank_transactions
          (id, user_id, buchungsdatum, betrag, haendler, verwendungszweck,
           match_status, matched_receipt_id, match_confidence, imported_at)
         VALUES
          (@id, @userId, @buchungsdatum, @betrag, @haendler, @verwendungszweck,
           @matchStatus, @matchedReceiptId, @matchConfidence, @importedAt)`
      );

      const importedAt = Date.now();
      const insertAll = db.transaction((items: Omit<BankTransaction, "importedAt" | "userId">[]) => {
        for (const row of items) {
          stmt.run({
            ...row,
            userId,
            importedAt,
            haendler: encrypt(row.haendler),
            verwendungszweck: encrypt(row.verwendungszweck),
          });
        }
      });

      insertAll(rows);
    },

    getDeduplicateKeys(userId: string): Set<string> {
      const rows = db
        .prepare("SELECT buchungsdatum, betrag, haendler FROM bank_transactions WHERE user_id = ?")
        .all(userId) as Array<{ buchungsdatum: string; betrag: number; haendler: string }>;
      return new Set(rows.map((r) => `${r.buchungsdatum}|${r.betrag}|${decrypt(r.haendler)}`));
    },

    listByUser(userId: string, filter?: { from?: string; to?: string }): BankTransaction[] {
      const base = `SELECT ${SELECT_COLS} FROM bank_transactions WHERE user_id = ?`;
      let rows: DbRow[];

      if (filter?.from && filter?.to) {
        rows = db
          .prepare(`${base} AND buchungsdatum >= ? AND buchungsdatum <= ? ORDER BY buchungsdatum DESC`)
          .all(userId, filter.from, filter.to) as DbRow[];
      } else if (filter?.from) {
        rows = db
          .prepare(`${base} AND buchungsdatum >= ? ORDER BY buchungsdatum DESC`)
          .all(userId, filter.from) as DbRow[];
      } else if (filter?.to) {
        rows = db
          .prepare(`${base} AND buchungsdatum <= ? ORDER BY buchungsdatum DESC`)
          .all(userId, filter.to) as DbRow[];
      } else {
        rows = db.prepare(`${base} ORDER BY buchungsdatum DESC`).all(userId) as DbRow[];
      }

      return rows.map(rowToTransaction);
    },

    listUnmatched(userId: string): BankTransaction[] {
      const rows = db
        .prepare(
          `SELECT ${SELECT_COLS} FROM bank_transactions
           WHERE user_id = ? AND match_status = 'unmatched' AND betrag < 0
           ORDER BY buchungsdatum DESC`
        )
        .all(userId) as DbRow[];
      return rows.map(rowToTransaction);
    },

    updateMatch(
      id: string,
      userId: string,
      receiptId: string | null,
      confidence: "high" | "medium" | "low" | "manual"
    ): void {
      if (receiptId === null) {
        const result = db
          .prepare(
            `UPDATE bank_transactions
             SET match_status = 'unmatched', matched_receipt_id = NULL, match_confidence = NULL
             WHERE id = ? AND user_id = ?`
          )
          .run(id, userId);
        if (result.changes === 0) throw new NotFoundError(`Transaction ${id} not found or access denied`);
      } else {
        const result = db
          .prepare(
            `UPDATE bank_transactions
             SET match_status = 'matched', matched_receipt_id = @receiptId, match_confidence = @confidence
             WHERE id = @id AND user_id = @userId`
          )
          .run({ id, userId, receiptId, confidence });
        if (result.changes === 0) throw new NotFoundError(`Transaction ${id} not found or access denied`);
      }
    },

    updateStatus(id: string, userId: string, status: "unmatched" | "matched" | "ignored"): void {
      const result = db
        .prepare(
          `UPDATE bank_transactions SET match_status = @status WHERE id = @id AND user_id = @userId`
        )
        .run({ id, userId, status });
      if (result.changes === 0) throw new NotFoundError(`Transaction ${id} not found or access denied`);
    },

    deleteById(id: string, userId: string): void {
      const result = db
        .prepare("DELETE FROM bank_transactions WHERE id = ? AND user_id = ?")
        .run(id, userId);
      if (result.changes === 0) throw new NotFoundError(`Transaction ${id} not found or access denied`);
    },

    deleteByRange(userId: string, from: string, to: string): number {
      const result = db
        .prepare(
          "DELETE FROM bank_transactions WHERE user_id = ? AND buchungsdatum >= ? AND buchungsdatum <= ?"
        )
        .run(userId, from, to);
      return result.changes;
    },

    countByRange(userId: string, from: string, to: string): number {
      const row = db
        .prepare(
          "SELECT COUNT(*) as count FROM bank_transactions WHERE user_id = ? AND buchungsdatum >= ? AND buchungsdatum <= ?"
        )
        .get(userId, from, to) as { count: number };
      return row.count;
    },
  };
}

export type TransactionRepo = ReturnType<typeof createTransactionRepo>;
```

- [ ] **Step 4: Run tests — expect all to pass**

```bash
cd server && npx vitest run test/bank-repo.test.ts --reporter=verbose
```

Expected: `✓ 14 tests pass`

- [ ] **Step 5: Run full server test suite to confirm no regressions**

```bash
cd server && npm test
```

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
cd server && git add src/bank/transactionRepo.ts test/bank-repo.test.ts && git commit -m "feat(bank): encrypt haendler/verwendungszweck, add dedup keys, filter and targeted delete"
```

---

## Task 3: Update API Routes

**Files:**
- Modify: `server/src/bank/routes.ts`

Changes:
1. `GET /api/bank/transactions` — accept optional `from`/`to` query params
2. `POST /api/bank/import` — app-layer dedup check, return `duplicates` in response
3. `DELETE /api/bank/transactions/:id` — new route, single delete
4. `DELETE /api/bank/transactions` — replace old clear-all with range delete (required `from`/`to`)

- [ ] **Step 1: Replace `server/src/bank/routes.ts`**

Replace the entire file with:

```ts
import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { Db } from "../db/index.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { buildOAuth2ClientFromSession } from "../google/client.js";
import { sheetsFor, readAllRows, readSplits } from "../google/sheets.js";
import { parseIngCsv } from "./csvParser.js";
import { matchTransactions, type ReceiptForMatching } from "./matcher.js";
import { createTransactionRepo, NotFoundError } from "./transactionRepo.js";

export type BankDeps = {
  config: Config;
  userRepo: UserRepo;
  db: Db;
};

const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      ["text/csv", "text/plain", "application/csv", "application/vnd.ms-excel"].includes(
        file.mimetype
      ) || file.originalname.toLowerCase().endsWith(".csv");
    if (ok) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files allowed"));
    }
  },
}).single("file");

const MatchBody = z.object({
  transactionId: z.string().min(1),
  receiptId: z.string().min(1).nullable(),
});

const IgnoreBody = z.object({
  transactionId: z.string().min(1),
});

const DateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const FilterQuery = z.object({
  from: DateParam.optional(),
  to: DateParam.optional(),
});

const RangeDeleteQuery = z.object({
  from: DateParam,
  to: DateParam,
});

export function buildBankRouter(deps: BankDeps): Router {
  const txRepo = createTransactionRepo(deps.db);
  const router = Router();
  router.use(requireAuth);

  // GET /api/bank/transactions?from=YYYY-MM-DD&to=YYYY-MM-DD
  router.get("/transactions", (req, res, next) => {
    try {
      const parsed = FilterQuery.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: "invalid query", details: parsed.error.flatten() });
      }
      const userId = req.session.userId!;
      const transactions = txRepo.listByUser(userId, parsed.data);
      res.json({ transactions });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/bank/import
  router.post(
    "/import",
    (req, res, next) => {
      uploadCsv(req, res, (err: unknown) => {
        if (err)
          return res.status(400).json({ error: err instanceof Error ? err.message : "Upload error" });
        next();
      });
    },
    async (req, res, next) => {
      try {
        if (!req.file) return res.status(400).json({ error: "file required" });

        const buf = req.file.buffer;
        const csvText =
          buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
            ? buf.slice(3).toString("utf-8")
            : buf.toString("latin1");
        const { transactions: allParsed, errors: parseErrors } = parseIngCsv(csvText);

        const userId = req.session.userId!;

        // App-layer dedup check against existing DB rows
        const existingKeys = txRepo.getDeduplicateKeys(userId);
        const newTransactions = [];
        const duplicates = [];

        for (const tx of allParsed) {
          const key = `${tx.buchungsdatum}|${tx.betrag}|${tx.haendler}`;
          if (existingKeys.has(key)) {
            duplicates.push({
              buchungsdatum: tx.buchungsdatum,
              haendler: tx.haendler,
              betrag: tx.betrag,
            });
          } else {
            newTransactions.push(tx);
          }
        }

        // Auto-match only new transactions
        const user = deps.userRepo.getById(userId);
        let receipts: ReceiptForMatching[] = [];
        if (user?.sheetId) {
          try {
            const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
            const sheets = sheetsFor(auth);
            const rows = await readAllRows(sheets, user.sheetId);
            receipts = rows.map((r) => ({
              id: r.id,
              datum: r.datum,
              haendler: r.haendler,
              betrag: r.betrag,
            }));
          } catch {
            // Non-fatal — import continues without auto-match
          }
        }

        const matchResults = matchTransactions(newTransactions, receipts);

        const rows = newTransactions.map((tx, i) => {
          const matchResult = matchResults[i];
          const isMatched = matchResult?.confidence != null;
          return {
            id: uuidv4(),
            buchungsdatum: tx.buchungsdatum,
            betrag: tx.betrag,
            haendler: tx.haendler,
            verwendungszweck: tx.verwendungszweck,
            matchStatus: (isMatched ? "matched" : "unmatched") as "matched" | "unmatched",
            matchedReceiptId: matchResult?.matchedReceiptId ?? null,
            matchConfidence: matchResult?.confidence ?? null,
          };
        });

        txRepo.insertMany(userId, rows);

        const autoMatched = rows.filter((r) => r.matchStatus === "matched").length;
        const unmatched = rows.filter((r) => r.matchStatus === "unmatched").length;

        res.json({
          imported: rows.length,
          autoMatched,
          unmatched,
          parseErrors,
          duplicates,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/bank/match
  router.post("/match", async (req, res, next) => {
    try {
      const parsed = MatchBody.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });

      const userId = req.session.userId!;
      const { transactionId, receiptId } = parsed.data;

      if (receiptId !== null) {
        const user = deps.userRepo.getById(userId);
        if (!user?.sheetId) {
          return res.status(400).json({ error: "No Google Sheet configured for this user" });
        }
        const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
        const sheets = sheetsFor(auth);
        const allRows = await readAllRows(sheets, user.sheetId);
        const exists = allRows.some((r) => r.id === receiptId);
        if (!exists) {
          return res.status(404).json({ error: `Receipt ${receiptId} not found` });
        }
      }

      txRepo.updateMatch(transactionId, userId, receiptId, "manual");

      deps.db
        .prepare("DELETE FROM split_bank_links WHERE bank_tx_id = ? AND user_id = ?")
        .run(transactionId, userId);

      res.json({ ok: true });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return res.status(404).json({ error: err.message });
      }
      next(err);
    }
  });

  // POST /api/bank/ignore
  router.post("/ignore", (req, res, next) => {
    try {
      const parsed = IgnoreBody.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });

      const userId = req.session.userId!;
      txRepo.updateStatus(parsed.data.transactionId, userId, "ignored");
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return res.status(404).json({ error: err.message });
      }
      next(err);
    }
  });

  // POST /api/bank/auto-match
  router.post("/auto-match", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.sheetId) return res.json({ matched: 0 });

      const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
      const sheets = sheetsFor(auth);
      const allRows = await readAllRows(sheets, user.sheetId);

      const alreadyMatchedReceiptIds = new Set(
        txRepo
          .listByUser(userId)
          .filter((tx) => tx.matchStatus === "matched" && tx.matchedReceiptId)
          .map((tx) => tx.matchedReceiptId!)
      );

      const receipts: ReceiptForMatching[] = allRows
        .filter((r) => !alreadyMatchedReceiptIds.has(r.id))
        .map((r) => ({ id: r.id, datum: r.datum, haendler: r.haendler, betrag: r.betrag }));

      const unmatchedTxs = txRepo.listUnmatched(userId);

      if (unmatchedTxs.length === 0 || receipts.length === 0) {
        return res.json({ matched: 0 });
      }

      const matchResults = matchTransactions(unmatchedTxs, receipts);

      let matched = 0;
      for (let i = 0; i < matchResults.length; i++) {
        const result = matchResults[i];
        const tx = unmatchedTxs[i];
        if (result?.confidence != null && result.matchedReceiptId && tx) {
          txRepo.updateMatch(tx.id, userId, result.matchedReceiptId, result.confidence);
          matched++;
        }
      }

      res.json({ matched });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/bank/auto-match-splits
  router.post("/auto-match-splits", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.sheetId) return res.json({ matched: 0 });

      const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
      const sheets = sheetsFor(auth);
      const splits = await readSplits(sheets, user.sheetId);

      const existingLinks = deps.db
        .prepare("SELECT split_id, bank_tx_id FROM split_bank_links WHERE user_id = ?")
        .all(userId) as Array<{ split_id: string; bank_tx_id: string }>;
      const linkedSplitIds = new Set(existingLinks.map((l) => l.split_id));
      const usedTxIds = new Set(existingLinks.map((l) => l.bank_tx_id));

      const unmatchedSplits = splits.filter((s) => !linkedSplitIds.has(s.splitId));
      if (unmatchedSplits.length === 0) return res.json({ matched: 0 });

      const positiveTxs = txRepo
        .listByUser(userId)
        .filter((tx) => tx.betrag > 0 && tx.matchStatus !== "ignored");

      if (positiveTxs.length === 0) return res.json({ matched: 0 });
      let matched = 0;

      const sortedSplits = [...unmatchedSplits].sort((a, b) => b.betrag - a.betrag);

      for (const split of sortedSplits) {
        const splitCents = Math.round(split.betrag * 100);
        const splitDays = Math.floor(new Date(split.datum).getTime() / 86_400_000);

        const matchingTx = positiveTxs.find((tx) => {
          if (usedTxIds.has(tx.id)) return false;
          if (Math.round(tx.betrag * 100) !== splitCents) return false;
          const txDays = Math.floor(new Date(tx.buchungsdatum).getTime() / 86_400_000);
          const diff = txDays - splitDays;
          return diff >= 0 && diff <= 60;
        });

        if (matchingTx) {
          deps.db
            .prepare(
              "INSERT OR IGNORE INTO split_bank_links (split_id, user_id, bank_tx_id, created_at) VALUES (?, ?, ?, ?)"
            )
            .run(split.splitId, userId, matchingTx.id, Date.now());
          usedTxIds.add(matchingTx.id);
          matched++;
        }
      }

      res.json({ matched });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/bank/transactions/:id  — single transaction
  router.delete("/transactions/:id", (req, res, next) => {
    try {
      const userId = req.session.userId!;
      txRepo.deleteById(req.params.id, userId);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return res.status(404).json({ error: err.message });
      }
      next(err);
    }
  });

  // DELETE /api/bank/transactions?from=YYYY-MM-DD&to=YYYY-MM-DD  — range delete
  router.delete("/transactions", (req, res, next) => {
    try {
      const parsed = RangeDeleteQuery.safeParse(req.query);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "from and to (YYYY-MM-DD) are required", details: parsed.error.flatten() });
      }
      const userId = req.session.userId!;
      const { from, to } = parsed.data;
      const deleted = txRepo.deleteByRange(userId, from, to);
      res.json({ ok: true, deleted });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 2: Run full server test suite**

```bash
cd server && npm test
```

Expected: all tests pass (no existing tests directly test the old `DELETE /api/bank/transactions` clear-all, so no test regressions).

- [ ] **Step 3: Run TypeScript type check**

```bash
cd server && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd server && git add src/bank/routes.ts && git commit -m "feat(bank): add dedup response, single+range delete endpoints, filter query param"
```

---

## Task 4: Client Types and API Client

**Files:**
- Modify: `client/src/types/bank.ts`
- Modify: `client/src/api/bank.ts`

- [ ] **Step 1: Update `client/src/types/bank.ts`**

Replace the entire file with:

```ts
export type BankTransaction = {
  id: string;
  userId: string;
  buchungsdatum: string;
  betrag: number;
  haendler: string;
  verwendungszweck: string;
  matchStatus: "unmatched" | "matched" | "ignored";
  matchedReceiptId: string | null;
  matchConfidence: "high" | "medium" | "low" | "manual" | null;
  importedAt: number;
};

export type DuplicateInfo = {
  buchungsdatum: string;
  haendler: string;
  betrag: number;
};

export type ImportResult = {
  imported: number;
  autoMatched: number;
  unmatched: number;
  parseErrors: string[];
  duplicates: DuplicateInfo[];
};
```

- [ ] **Step 2: Update `client/src/api/bank.ts`**

Replace the entire file with:

```ts
import { api } from "./client";
import type { BankTransaction, ImportResult } from "@/types/bank";

export const bankApi = {
  importCsv: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.postForm<ImportResult>("/api/bank/import", fd);
  },

  listTransactions: (filter?: { from?: string; to?: string }) => {
    const params = new URLSearchParams();
    if (filter?.from) params.set("from", filter.from);
    if (filter?.to) params.set("to", filter.to);
    const qs = params.size > 0 ? `?${params.toString()}` : "";
    return api.get<{ transactions: BankTransaction[] }>(`/api/bank/transactions${qs}`);
  },

  matchTransaction: (transactionId: string, receiptId: string | null) =>
    api.post<{ ok: boolean }>("/api/bank/match", { transactionId, receiptId }),

  ignoreTransaction: (transactionId: string) =>
    api.post<{ ok: boolean }>("/api/bank/ignore", { transactionId }),

  autoMatch: () =>
    api.post<{ matched: number }>("/api/bank/auto-match"),

  autoMatchSplits: () =>
    api.post<{ matched: number }>("/api/bank/auto-match-splits"),

  deleteTransaction: (id: string) =>
    api.delete<{ ok: boolean }>(`/api/bank/transactions/${id}`),

  deleteRange: (from: string, to: string) =>
    api.delete<{ ok: boolean; deleted: number }>(
      `/api/bank/transactions?from=${from}&to=${to}`
    ),
};
```

- [ ] **Step 3: TypeScript check**

```bash
cd client && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd client && git add src/types/bank.ts src/api/bank.ts && git commit -m "feat(bank): add DuplicateInfo type, extend ImportResult, add delete API methods"
```

---

## Task 5: UI — Filter, Duplicates, Deletion, Remove Bulk-Clear

**Files:**
- Modify: `client/src/pages/Kontoabgleich.tsx`

This task replaces the full `Kontoabgleich.tsx`. Read the existing file first to orient yourself, then apply the complete replacement below.

Changes from the current file:
- Add `filterFrom`, `filterTo`, `filterMonth` state
- Add `lastDuplicates` state (replaces nothing — new)
- Remove `confirmClear`, `busyClear` state
- Add `deleteConfirmTx` state for inline single-row deletion
- Remove `handleClear` function
- Add `handleDeleteTx`, `handleDeleteRange` functions
- Add `availableMonths` computation from all transactions
- Add `filteredTransactions` computation (client-side filter)
- Add filter UI section (month dropdown + date range inputs)
- Add duplicates collapsible list after upload zone
- Add Trash2 icon + inline confirm to every table row (all 3 tabs)
- Add "Zeitraum löschen" dialog
- Remove "Abgleich abschließen" button and its confirm dialog

- [ ] **Step 1: Replace `client/src/pages/Kontoabgleich.tsx`**

```tsx
import { useRef, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, ExternalLink, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { bankApi } from "@/api/bank";
import { receiptsApi } from "@/api/receipts";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import { BelegZuordnenDialog } from "@/components/bank/BelegZuordnenDialog";
import type { BankTransaction, DuplicateInfo } from "@/types/bank";
import type { ReceiptRow } from "@/types/receipt";

// ── Confidence badge ──────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: BankTransaction["matchConfidence"] }) {
  if (!confidence) return null;
  const map: Record<NonNullable<BankTransaction["matchConfidence"]>, { label: string; cls: string }> = {
    high:   { label: "Hoch",    cls: "bg-green-100 text-green-700" },
    medium: { label: "Mittel",  cls: "bg-yellow-100 text-yellow-700" },
    low:    { label: "Niedrig", cls: "bg-orange-100 text-orange-700" },
    manual: { label: "Manuell", cls: "bg-blue-100 text-blue-700" },
  };
  const { label, cls } = map[confidence];
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      {label}
    </span>
  );
}

// ── Betrag cell ───────────────────────────────────────────────────────────────

function BetragCell({ betrag }: { betrag: number }) {
  if (betrag < 0) {
    return <span className="text-red-500 font-medium">−{formatCurrency(Math.abs(betrag))}</span>;
  }
  return <span className="text-green-600 font-medium">{formatCurrency(betrag)}</span>;
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-center text-muted-foreground py-10">
        {message}
      </TableCell>
    </TableRow>
  );
}

// ── Inline delete confirm cell ────────────────────────────────────────────────

function DeleteCell({
  txId,
  isConfirming,
  isBusy,
  onAskConfirm,
  onConfirm,
  onCancel,
}: {
  txId: string;
  isConfirming: boolean;
  isBusy: boolean;
  onAskConfirm: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (isConfirming) {
    return (
      <div className="flex items-center justify-end gap-1">
        <span className="text-xs text-muted-foreground mr-1">Löschen?</span>
        <Button size="sm" variant="destructive" onClick={onConfirm} disabled={isBusy} className="h-7 px-2">
          Ja
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={isBusy} className="h-7 px-2">
          Nein
        </Button>
      </div>
    );
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={onAskConfirm}
      disabled={isBusy}
      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
      title="Transaktion löschen"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}

// ── Duplicates list ───────────────────────────────────────────────────────────

function DuplicatesList({ duplicates }: { duplicates: DuplicateInfo[] }) {
  const [open, setOpen] = useState(false);
  if (duplicates.length === 0) return null;

  const visible = duplicates.slice(0, 10);
  const rest = duplicates.length - visible.length;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
      <button
        type="button"
        className="flex items-center gap-2 text-sm font-medium text-amber-800 w-full text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {duplicates.length} bereits vorhandene Transaktion{duplicates.length !== 1 ? "en" : ""} übersprungen
      </button>
      {open && (
        <ul className="space-y-1 pl-6">
          {visible.map((d, i) => (
            <li key={i} className="text-xs text-amber-700 flex gap-3">
              <span className="text-muted-foreground w-24 shrink-0">{formatDateIso(d.buchungsdatum)}</span>
              <span className="flex-1 truncate">{d.haendler}</span>
              <span className="shrink-0"><BetragCell betrag={d.betrag} /></span>
            </li>
          ))}
          {rest > 0 && (
            <li className="text-xs text-muted-foreground pl-0">… und {rest} weitere</li>
          )}
        </ul>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function KontoabgleichPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchParams] = useSearchParams();

  // Upload state
  const [importing, setImporting] = useState(false);
  const [lastImportErrors, setLastImportErrors] = useState<string[]>([]);
  const [lastDuplicates, setLastDuplicates] = useState<DuplicateInfo[]>([]);

  // Filter state
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterMonth, setFilterMonth] = useState("all");

  // Action state
  const [autoMatching, setAutoMatching] = useState(false);
  const [assignTx, setAssignTx] = useState<BankTransaction | null>(null);
  const [viewReceipt, setViewReceipt] = useState<ReceiptRow | null>(null);
  const [deleteConfirmTx, setDeleteConfirmTx] = useState<string | null>(null);
  const [busyTx, setBusyTx] = useState<string | null>(null);

  // Range delete dialog
  const [rangeDeleteOpen, setRangeDeleteOpen] = useState(false);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [busyRangeDelete, setBusyRangeDelete] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["bank-transactions"],
    queryFn: () => bankApi.listTransactions(),
  });

  const { data: receiptsData } = useQuery({
    queryKey: ["receipts"],
    queryFn: () => receiptsApi.list(),
  });

  const receiptMap = useMemo<Map<string, ReceiptRow>>(() => {
    const map = new Map<string, ReceiptRow>();
    for (const r of receiptsData?.rows ?? []) map.set(r.id, r);
    return map;
  }, [receiptsData]);

  const allTransactions = data?.transactions ?? [];

  // Available months computed from all transactions
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    for (const tx of allTransactions) {
      months.add(tx.buchungsdatum.slice(0, 7)); // YYYY-MM
    }
    return [...months].sort((a, b) => b.localeCompare(a)); // descending
  }, [allTransactions]);

  // Client-side filtering
  const transactions = useMemo(() => {
    return allTransactions.filter((tx) => {
      if (filterFrom && tx.buchungsdatum < filterFrom) return false;
      if (filterTo && tx.buchungsdatum > filterTo) return false;
      return true;
    });
  }, [allTransactions, filterFrom, filterTo]);

  const unmatched = transactions.filter((t) => t.matchStatus === "unmatched");
  const matched   = transactions.filter((t) => t.matchStatus === "matched");
  const ignored   = transactions.filter((t) => t.matchStatus === "ignored");

  const alreadyMatchedIds = useMemo(
    () => new Set(transactions.filter((t) => t.matchedReceiptId).map((t) => t.matchedReceiptId!)),
    [transactions]
  );

  // ── Filter handlers ─────────────────────────────────────────────────────────

  function handleMonthSelect(value: string) {
    setFilterMonth(value);
    if (value === "all") {
      setFilterFrom("");
      setFilterTo("");
    } else {
      const [year, month] = value.split("-");
      const from = `${year}-${month}-01`;
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      const to = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
      setFilterFrom(from);
      setFilterTo(to);
    }
  }

  function handleFromChange(value: string) {
    setFilterFrom(value);
    setFilterMonth("custom");
  }

  function handleToChange(value: string) {
    setFilterTo(value);
    setFilterMonth("custom");
  }

  function handleResetFilter() {
    setFilterFrom("");
    setFilterTo("");
    setFilterMonth("all");
  }

  // ── CSV upload ──────────────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setLastDuplicates([]);
    try {
      const result = await bankApi.importCsv(file);
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      qc.invalidateQueries({ queryKey: ["splits"] });
      setLastImportErrors(result.parseErrors);
      setLastDuplicates(result.duplicates ?? []);
      toast({
        title: `${result.imported} Transaktionen importiert`,
        description: [
          `${result.autoMatched} Belege abgeglichen`,
          `${result.unmatched} offen`,
          result.duplicates?.length > 0
            ? `${result.duplicates.length} Duplikate übersprungen`
            : "",
          result.parseErrors.length > 0 ? `${result.parseErrors.length} Fehler` : "",
        ].filter(Boolean).join(" · "),
      });
    } catch {
      toast({ title: "Import fehlgeschlagen", variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ── Ignore ──────────────────────────────────────────────────────────────────

  async function handleIgnore(tx: BankTransaction) {
    setBusyTx(tx.id);
    try {
      await bankApi.ignoreTransaction(tx.id);
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      toast({ title: "Transaktion ignoriert" });
    } catch {
      toast({ title: "Fehler", variant: "destructive" });
    } finally {
      setBusyTx(null);
    }
  }

  // ── Unmatch / restore ────────────────────────────────────────────────────────

  async function handleUnmatch(tx: BankTransaction) {
    setBusyTx(tx.id);
    try {
      await bankApi.matchTransaction(tx.id, null);
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      qc.invalidateQueries({ queryKey: ["splits"] });
      toast({ title: "Zuordnung aufgehoben" });
    } catch {
      toast({ title: "Fehler", variant: "destructive" });
    } finally {
      setBusyTx(null);
    }
  }

  // ── Auto-match ───────────────────────────────────────────────────────────────

  async function handleAutoMatch() {
    setAutoMatching(true);
    try {
      const [txResult, splitResult] = await Promise.all([
        bankApi.autoMatch(),
        bankApi.autoMatchSplits(),
      ]);
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      qc.invalidateQueries({ queryKey: ["splits"] });
      const parts = [];
      if (txResult.matched > 0)
        parts.push(`${txResult.matched} Ausgabe${txResult.matched !== 1 ? "n" : ""} abgeglichen`);
      if (splitResult.matched > 0)
        parts.push(
          `${splitResult.matched} Rückzahlung${splitResult.matched !== 1 ? "en" : ""} zugeordnet`
        );
      toast({
        title:
          parts.length > 0
            ? parts.join(" · ")
            : "Keine neuen Übereinstimmungen",
        description:
          parts.length > 0
            ? undefined
            : "Alle Transaktionen sind bereits abgeglichen oder kein Beleg passt.",
      });
    } catch {
      toast({ title: "Auto-Abgleich fehlgeschlagen", variant: "destructive" });
    } finally {
      setAutoMatching(false);
    }
  }

  // ── Single delete ────────────────────────────────────────────────────────────

  async function handleDeleteTx(id: string) {
    setBusyTx(id);
    try {
      await bankApi.deleteTransaction(id);
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      qc.invalidateQueries({ queryKey: ["splits"] });
      toast({ title: "Transaktion gelöscht" });
    } catch {
      toast({ title: "Fehler beim Löschen", variant: "destructive" });
    } finally {
      setBusyTx(null);
      setDeleteConfirmTx(null);
    }
  }

  // ── Range delete ─────────────────────────────────────────────────────────────

  const rangeDeleteCount = useMemo(() => {
    if (!rangeFrom || !rangeTo) return 0;
    return allTransactions.filter(
      (tx) => tx.buchungsdatum >= rangeFrom && tx.buchungsdatum <= rangeTo
    ).length;
  }, [allTransactions, rangeFrom, rangeTo]);

  async function handleDeleteRange() {
    if (!rangeFrom || !rangeTo) return;
    setBusyRangeDelete(true);
    try {
      const res = await bankApi.deleteRange(rangeFrom, rangeTo);
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      qc.invalidateQueries({ queryKey: ["splits"] });
      toast({ title: `${res.deleted} Transaktionen gelöscht` });
      setRangeDeleteOpen(false);
      setRangeFrom("");
      setRangeTo("");
    } catch {
      toast({ title: "Fehler beim Löschen", variant: "destructive" });
    } finally {
      setBusyRangeDelete(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Kontoabgleich</h1>
        <p className="text-[hsl(var(--muted-foreground))]">
          Gleiche Kontobewegungen mit deinen Belegen ab
        </p>
      </div>

      {/* CSV Upload */}
      <div className="space-y-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          disabled={importing}
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/20 px-8 py-10 text-center text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/40 disabled:opacity-60"
        >
          <Upload className="h-8 w-8 opacity-50" />
          <span className="text-sm font-medium">
            {importing ? "Wird importiert…" : "ING-CSV hier ablegen oder auswählen"}
          </span>
          <span className="text-xs opacity-60">ING Deutschland Kontoauszug (CSV-Export)</span>
        </button>

        {lastImportErrors.length > 0 && (
          <div className="text-sm text-red-600 space-y-1">
            <p className="font-medium">{lastImportErrors.length} Zeile(n) konnten nicht verarbeitet werden:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {lastImportErrors.slice(0, 5).map((err, i) => (
                <li key={i} className="text-red-500">{err}</li>
              ))}
              {lastImportErrors.length > 5 && (
                <li className="text-muted-foreground">… und {lastImportErrors.length - 5} weitere</li>
              )}
            </ul>
          </div>
        )}

        <DuplicatesList duplicates={lastDuplicates} />
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Monat
          </label>
          <Select value={filterMonth} onValueChange={handleMonthSelect}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Alle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              {availableMonths.map((m) => {
                const [year, month] = m.split("-");
                const label = new Date(`${year}-${month}-01`).toLocaleDateString("de-DE", {
                  month: "long",
                  year: "numeric",
                });
                return (
                  <SelectItem key={m} value={m}>
                    {label}
                  </SelectItem>
                );
              })}
              {filterMonth === "custom" && (
                <SelectItem value="custom">Benutzerdefiniert</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Von
          </label>
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => handleFromChange(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Bis
          </label>
          <input
            type="date"
            value={filterTo}
            onChange={(e) => handleToChange(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {(filterFrom || filterTo) && (
          <Button variant="ghost" size="sm" onClick={handleResetFilter} className="mb-0.5">
            Filter zurücksetzen
          </Button>
        )}
      </div>

      {/* Stats bar */}
      {isLoading ? (
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Gesamt",           value: transactions.length,  cls: "" },
            { label: "Abgeglichen",      value: matched.length,       cls: "text-green-600" },
            { label: "Nicht zugeordnet", value: unmatched.length,     cls: "text-yellow-600" },
            { label: "Ignoriert",        value: ignored.length,       cls: "text-muted-foreground" },
          ].map(({ label, value, cls }) => (
            <div key={label} className="rounded-xl border border-border bg-card p-4 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
              </p>
              <p className={`text-2xl font-bold ${cls}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Tabs defaultValue={searchParams.get("tab") ?? "unmatched"}>
          <TabsList>
            <TabsTrigger value="unmatched">
              Nicht zugeordnet{" "}
              {unmatched.length > 0 && (
                <span className="ml-1.5 rounded-full bg-yellow-100 text-yellow-700 px-1.5 text-[10px] font-bold">
                  {unmatched.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="matched">Abgeglichen</TabsTrigger>
            <TabsTrigger value="ignored">Ignoriert</TabsTrigger>
          </TabsList>

          {/* ── Nicht zugeordnet ── */}
          <TabsContent value="unmatched">
            <div className="rounded-xl border border-border overflow-hidden mt-2">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-border">
                    <TableHead>Datum</TableHead>
                    <TableHead>Händler</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead className="max-w-[200px]">Verwendungszweck</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unmatched.length === 0 ? (
                    <EmptyRow colSpan={5} message="Alle Transaktionen sind zugeordnet oder ignoriert." />
                  ) : (
                    unmatched.map((tx) => (
                      <TableRow
                        key={tx.id}
                        className="hover:bg-muted/30 transition-colors border-b border-border"
                      >
                        <TableCell className="text-muted-foreground">
                          {formatDateIso(tx.buchungsdatum)}
                        </TableCell>
                        <TableCell className="font-medium">{tx.haendler}</TableCell>
                        <TableCell className="text-right">
                          <BetragCell betrag={tx.betrag} />
                        </TableCell>
                        <TableCell
                          className="max-w-[200px] truncate text-muted-foreground text-xs"
                          title={tx.verwendungszweck}
                        >
                          {tx.verwendungszweck}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {deleteConfirmTx === tx.id ? (
                              <DeleteCell
                                txId={tx.id}
                                isConfirming
                                isBusy={busyTx === tx.id}
                                onAskConfirm={() => setDeleteConfirmTx(tx.id)}
                                onConfirm={() => handleDeleteTx(tx.id)}
                                onCancel={() => setDeleteConfirmTx(null)}
                              />
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => setAssignTx(tx)}
                                  disabled={busyTx === tx.id}
                                >
                                  Zuordnen
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleIgnore(tx)}
                                  disabled={busyTx === tx.id}
                                >
                                  Ignorieren
                                </Button>
                                <DeleteCell
                                  txId={tx.id}
                                  isConfirming={false}
                                  isBusy={busyTx === tx.id}
                                  onAskConfirm={() => setDeleteConfirmTx(tx.id)}
                                  onConfirm={() => handleDeleteTx(tx.id)}
                                  onCancel={() => setDeleteConfirmTx(null)}
                                />
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ── Abgeglichen ── */}
          <TabsContent value="matched">
            <div className="rounded-xl border border-border overflow-hidden mt-2">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-border">
                    <TableHead>Datum</TableHead>
                    <TableHead>Händler</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead>Konfidenz</TableHead>
                    <TableHead>Verknüpfter Beleg</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matched.length === 0 ? (
                    <EmptyRow colSpan={6} message="Noch keine Transaktionen abgeglichen." />
                  ) : (
                    matched.map((tx) => {
                      const receipt = tx.matchedReceiptId
                        ? receiptMap.get(tx.matchedReceiptId)
                        : undefined;
                      return (
                        <TableRow
                          key={tx.id}
                          className="hover:bg-muted/30 transition-colors border-b border-border"
                        >
                          <TableCell className="text-muted-foreground">
                            {formatDateIso(tx.buchungsdatum)}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium leading-tight">{tx.haendler}</div>
                            {tx.verwendungszweck && (
                              <div
                                className="text-xs text-muted-foreground truncate max-w-[200px]"
                                title={tx.verwendungszweck}
                              >
                                {tx.verwendungszweck}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <BetragCell betrag={tx.betrag} />
                          </TableCell>
                          <TableCell>
                            <ConfidenceBadge confidence={tx.matchConfidence} />
                          </TableCell>
                          <TableCell>
                            {receipt ? (
                              <button
                                className="text-left hover:underline"
                                onClick={() => setViewReceipt(receipt)}
                              >
                                <span className="font-medium text-sm">{receipt.haendler}</span>
                                <span className="text-muted-foreground text-xs ml-1.5">
                                  {formatDateIso(receipt.datum)} ·{" "}
                                  {formatCurrency(receipt.betrag, receipt.waehrung)}
                                </span>
                              </button>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {deleteConfirmTx === tx.id ? (
                                <DeleteCell
                                  txId={tx.id}
                                  isConfirming
                                  isBusy={busyTx === tx.id}
                                  onAskConfirm={() => setDeleteConfirmTx(tx.id)}
                                  onConfirm={() => handleDeleteTx(tx.id)}
                                  onCancel={() => setDeleteConfirmTx(null)}
                                />
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setAssignTx(tx)}
                                    disabled={busyTx === tx.id}
                                  >
                                    Neu zuordnen
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleUnmatch(tx)}
                                    disabled={busyTx === tx.id}
                                  >
                                    Aufheben
                                  </Button>
                                  <DeleteCell
                                    txId={tx.id}
                                    isConfirming={false}
                                    isBusy={busyTx === tx.id}
                                    onAskConfirm={() => setDeleteConfirmTx(tx.id)}
                                    onConfirm={() => handleDeleteTx(tx.id)}
                                    onCancel={() => setDeleteConfirmTx(null)}
                                  />
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ── Ignoriert ── */}
          <TabsContent value="ignored">
            <div className="rounded-xl border border-border overflow-hidden mt-2">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-border">
                    <TableHead>Datum</TableHead>
                    <TableHead>Händler</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead className="max-w-[200px]">Verwendungszweck</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ignored.length === 0 ? (
                    <EmptyRow colSpan={5} message="Keine ignorierten Transaktionen." />
                  ) : (
                    ignored.map((tx) => (
                      <TableRow
                        key={tx.id}
                        className="hover:bg-muted/30 transition-colors border-b border-border"
                      >
                        <TableCell className="text-muted-foreground">
                          {formatDateIso(tx.buchungsdatum)}
                        </TableCell>
                        <TableCell className="font-medium">{tx.haendler}</TableCell>
                        <TableCell className="text-right">
                          <BetragCell betrag={tx.betrag} />
                        </TableCell>
                        <TableCell
                          className="max-w-[200px] truncate text-muted-foreground text-xs"
                          title={tx.verwendungszweck}
                        >
                          {tx.verwendungszweck}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {deleteConfirmTx === tx.id ? (
                              <DeleteCell
                                txId={tx.id}
                                isConfirming
                                isBusy={busyTx === tx.id}
                                onAskConfirm={() => setDeleteConfirmTx(tx.id)}
                                onConfirm={() => handleDeleteTx(tx.id)}
                                onCancel={() => setDeleteConfirmTx(null)}
                              />
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleUnmatch(tx)}
                                  disabled={busyTx === tx.id}
                                >
                                  Wiederherstellen
                                </Button>
                                <DeleteCell
                                  txId={tx.id}
                                  isConfirming={false}
                                  isBusy={busyTx === tx.id}
                                  onAskConfirm={() => setDeleteConfirmTx(tx.id)}
                                  onConfirm={() => handleDeleteTx(tx.id)}
                                  onCancel={() => setDeleteConfirmTx(null)}
                                />
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Actions */}
      {allTransactions.length > 0 && (
        <div className="flex justify-between items-center pt-2">
          <Button
            variant="outline"
            onClick={handleAutoMatch}
            disabled={autoMatching || unmatched.length === 0}
          >
            {autoMatching ? "Wird abgeglichen…" : "Auto-Abgleich"}
          </Button>
          <Button variant="outline" onClick={() => setRangeDeleteOpen(true)}>
            Zeitraum löschen
          </Button>
        </div>
      )}

      {/* Beleg-Detailmodal */}
      <Dialog
        open={viewReceipt !== null}
        onOpenChange={(open) => {
          if (!open) setViewReceipt(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{viewReceipt?.haendler}</DialogTitle>
            <DialogDescription>
              {viewReceipt && formatDateIso(viewReceipt.datum)}
            </DialogDescription>
          </DialogHeader>
          {viewReceipt && (
            <div className="space-y-2 text-sm">
              {(
                [
                  ["Betrag", formatCurrency(viewReceipt.betrag, viewReceipt.waehrung)],
                  ["MwSt", formatCurrency(viewReceipt.mwst, viewReceipt.waehrung)],
                  viewReceipt.trinkgeld > 0
                    ? ["Trinkgeld", formatCurrency(viewReceipt.trinkgeld, viewReceipt.waehrung)]
                    : null,
                  ["Kategorie", viewReceipt.kategorie],
                  ["Zahlungsmethode", viewReceipt.zahlungsmethode],
                  viewReceipt.rechnungsnummer
                    ? ["Rechnungsnummer", viewReceipt.rechnungsnummer]
                    : null,
                ] as Array<string[] | null>
              )
                .filter((row): row is string[] => row !== null)
                .map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium text-right">{value}</span>
                  </div>
                ))}
              {viewReceipt.driveLink && (
                <a
                  href={viewReceipt.driveLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-primary hover:underline pt-1"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Beleg in Drive öffnen
                </a>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setViewReceipt(null)}>
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BelegZuordnenDialog */}
      <BelegZuordnenDialog
        transaction={assignTx}
        onClose={() => setAssignTx(null)}
        onAssigned={() => {
          setAssignTx(null);
          qc.invalidateQueries({ queryKey: ["bank-transactions"] });
          qc.invalidateQueries({ queryKey: ["splits"] });
        }}
        alreadyMatchedReceiptIds={alreadyMatchedIds}
      />

      {/* Range delete dialog */}
      <Dialog open={rangeDeleteOpen} onOpenChange={(open) => { if (!open) setRangeDeleteOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Zeitraum löschen</DialogTitle>
            <DialogDescription>
              Alle Transaktionen im gewählten Zeitraum werden unwiderruflich gelöscht.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-muted-foreground">Von</label>
                <input
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-muted-foreground">Bis</label>
                <input
                  type="date"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
            {rangeFrom && rangeTo && (
              <p className={`text-sm ${rangeDeleteCount > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                {rangeDeleteCount > 0
                  ? `${rangeDeleteCount} Transaktion${rangeDeleteCount !== 1 ? "en" : ""} werden gelöscht.`
                  : "Keine Transaktionen in diesem Zeitraum."}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setRangeDeleteOpen(false)}
              disabled={busyRangeDelete}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteRange}
              disabled={busyRangeDelete || !rangeFrom || !rangeTo || rangeDeleteCount === 0}
            >
              {busyRangeDelete ? "Wird gelöscht…" : "Löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd client && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Run full server tests to confirm nothing broken**

```bash
cd server && npm test
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
cd client && git add src/pages/Kontoabgleich.tsx && git commit -m "feat(bank): add filter, duplicates list, single+range delete, remove bulk-clear button"
```

---

## Task 6: Document BANK_ENCRYPTION_KEY in .env.example

**Files:**
- Modify: `.env.example` (or equivalent env documentation file in the project root)

- [ ] **Step 1: Check if `.env.example` exists**

```bash
ls C:/Development/beleg-manager/.env.example 2>$null || echo "not found"
```

- [ ] **Step 2: Add BANK_ENCRYPTION_KEY entry**

Open `.env.example` (create if missing) and add at the end:

```
# 32-byte hex key for AES-256-GCM encryption of bank transaction fields (haendler, verwendungszweck).
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# If omitted, fields are stored as plaintext (dev fallback only — always set in production).
BANK_ENCRYPTION_KEY=
```

- [ ] **Step 3: Commit**

```bash
cd C:/Development/beleg-manager && git add .env.example && git commit -m "docs: document BANK_ENCRYPTION_KEY in .env.example"
```

---

## Final Verification

- [ ] Run full server test suite: `cd server && npm test` — all pass
- [ ] Run server typecheck: `cd server && npm run typecheck` — no errors
- [ ] Run client typecheck: `cd client && npm run typecheck` — no errors
- [ ] Update `context/progress-tracker.md` with completed work and architecture decisions

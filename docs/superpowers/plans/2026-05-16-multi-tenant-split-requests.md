# Multi-Tenant Split Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cross-user "Aufteilungsanforderung" system where User A can request User B (a registered user found via search) to pay a portion of a receipt, with User B able to preview the receipt and accept or reject the request.

**Architecture:** A new `split_requests` SQLite table handles all cross-user coordination. Receipt previews are served server-side by fetching from the requesting user's Google Drive using their stored refresh token — User B never gets direct Drive access. All endpoints enforce strict session-based authorization to prevent IDOR and broken access control.

**Tech Stack:** Node.js + Express + TypeScript, better-sqlite3, Google Drive API v3, Zod, React + TanStack Query, Shadcn/UI (Command, Dialog, Tabs, Badge, Card)

---

## File Map

**Create (server):**
- `server/src/split-requests/repo.ts` — SQLite CRUD for split_requests table
- `server/src/split-requests/schema.ts` — Zod schemas for all request bodies
- `server/src/split-requests/routes.ts` — Express router with all endpoints + receipt proxy
- `server/src/users/searchRoutes.ts` — GET /api/users/search

**Modify (server):**
- `server/src/db/migrations.ts` — add split_requests table + indexes
- `server/src/app.ts` — wire up two new routers

**Create (client):**
- `client/src/api/splitRequests.ts` — API client for split-requests endpoints
- `client/src/api/users.ts` — API client for user search
- `client/src/hooks/useSplitRequests.ts` — TanStack Query hooks for incoming/outgoing
- `client/src/hooks/useUserSearch.ts` — debounced user search hook
- `client/src/components/split-requests/RequestCard.tsx` — single request card
- `client/src/components/split-requests/ReceiptPreviewModal.tsx` — receipt viewer dialog
- `client/src/components/split-requests/IncomingList.tsx` — incoming tab content
- `client/src/components/split-requests/OutgoingList.tsx` — outgoing tab content
- `client/src/components/split-requests/CreateRequestDialog.tsx` — dialog to create a new cross-user request
- `client/src/pages/Requests.tsx` — /requests page with tabs

**Modify (client):**
- `client/src/App.tsx` — add /requests route
- `client/src/components/AppShell.tsx` — add Anforderungen nav item with badge

---

### Task 1: DB Migration — add split_requests table

**Files:**
- Modify: `server/src/db/migrations.ts`

- [ ] **Step 1: Add the split_requests table and indexes to runMigrations**

In `server/src/db/migrations.ts`, add these three `db.exec` calls at the end of `runMigrations`, after the existing `addColumnIfMissing` calls:

```typescript
export function runMigrations(db: Db): void {
  db.exec(SCHEMA);
  addColumnIfMissing(db, "users", "gmail_polling_enabled", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "users", "gmail_label_filter", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "users", "telegram_bot_token", "TEXT");
  addColumnIfMissing(db, "users", "receipts_view_mode", "TEXT NOT NULL DEFAULT 'table'");
  addColumnIfMissing(db, "users", "start_page", "TEXT NOT NULL DEFAULT '/'");

  db.exec(`
    CREATE TABLE IF NOT EXISTS split_requests (
      id            TEXT PRIMARY KEY,
      from_user_id  TEXT NOT NULL,
      to_user_id    TEXT NOT NULL,
      receipt_id    TEXT NOT NULL,
      receipt_meta  TEXT NOT NULL,
      betrag        REAL NOT NULL,
      nachricht     TEXT NOT NULL DEFAULT '',
      status        TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','accepted','rejected','cancelled')),
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL,
      FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (to_user_id)   REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_split_req_to   ON split_requests(to_user_id, status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_split_req_from ON split_requests(from_user_id, status)`);
}
```

- [ ] **Step 2: Start the server and verify the table was created**

```bash
cd C:\Development\beleg-manager
npx tsx server/src/server.ts
```

Expected: server starts without error. Then in a separate terminal:
```bash
sqlite3 data/app.db ".schema split_requests"
```
Expected output includes `CREATE TABLE split_requests` with all columns.

- [ ] **Step 3: Commit**

```bash
git add server/src/db/migrations.ts
git commit -m "feat: add split_requests table migration"
```

---

### Task 2: Server — split-requests repo

**Files:**
- Create: `server/src/split-requests/repo.ts`

- [ ] **Step 1: Create the repo file**

Create `server/src/split-requests/repo.ts`:

```typescript
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
  toUserId: string;
  receiptId: string;
  receiptMeta: ReceiptMeta;
  betrag: number;
  nachricht: string;
  status: SplitRequestStatus;
  createdAt: number;
  updatedAt: number;
};

type RawRow = Omit<SplitRequestRow, "receiptMeta"> & { receiptMeta: string };

function parseRow(raw: RawRow): SplitRequestRow {
  return { ...raw, receiptMeta: JSON.parse(raw.receiptMeta) as ReceiptMeta };
}

export function createSplitRequestRepo(db: Db) {
  return {
    create(input: {
      fromUserId: string;
      toUserId: string;
      receiptId: string;
      receiptMeta: ReceiptMeta;
      betrag: number;
      nachricht: string;
    }): SplitRequestRow {
      const now = Date.now();
      const id = uuidv4();
      db.prepare(
        `INSERT INTO split_requests
          (id, from_user_id, to_user_id, receipt_id, receipt_meta, betrag, nachricht, status, created_at, updated_at)
         VALUES (@id, @fromUserId, @toUserId, @receiptId, @receiptMeta, @betrag, @nachricht, 'pending', @now, @now)`
      ).run({
        id,
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
        receiptId: input.receiptId,
        receiptMeta: JSON.stringify(input.receiptMeta),
        betrag: input.betrag,
        nachricht: input.nachricht,
        now,
      });
      return this.getById(id)!;
    },

    getById(id: string): SplitRequestRow | undefined {
      const raw = db.prepare(
        `SELECT id,
          from_user_id AS fromUserId,
          to_user_id AS toUserId,
          receipt_id AS receiptId,
          receipt_meta AS receiptMeta,
          betrag, nachricht, status,
          created_at AS createdAt,
          updated_at AS updatedAt
         FROM split_requests WHERE id = ?`
      ).get(id) as RawRow | undefined;
      return raw ? parseRow(raw) : undefined;
    },

    listIncoming(toUserId: string): SplitRequestRow[] {
      const rows = db.prepare(
        `SELECT id,
          from_user_id AS fromUserId,
          to_user_id AS toUserId,
          receipt_id AS receiptId,
          receipt_meta AS receiptMeta,
          betrag, nachricht, status,
          created_at AS createdAt,
          updated_at AS updatedAt
         FROM split_requests WHERE to_user_id = ? ORDER BY created_at DESC`
      ).all(toUserId) as RawRow[];
      return rows.map(parseRow);
    },

    listOutgoing(fromUserId: string): SplitRequestRow[] {
      const rows = db.prepare(
        `SELECT id,
          from_user_id AS fromUserId,
          to_user_id AS toUserId,
          receipt_id AS receiptId,
          receipt_meta AS receiptMeta,
          betrag, nachricht, status,
          created_at AS createdAt,
          updated_at AS updatedAt
         FROM split_requests WHERE from_user_id = ? ORDER BY created_at DESC`
      ).all(fromUserId) as RawRow[];
      return rows.map(parseRow);
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd C:\Development\beleg-manager
npx tsc -p server/tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/split-requests/repo.ts
git commit -m "feat: add split request repo"
```

---

### Task 3: Server — Zod schemas

**Files:**
- Create: `server/src/split-requests/schema.ts`

- [ ] **Step 1: Create the schema file**

Create `server/src/split-requests/schema.ts`:

```typescript
import { z } from "zod";

export const CreateSplitRequestBody = z.object({
  toUserId: z.string().min(1),
  receiptId: z.string().min(1),
  receiptMeta: z.object({
    haendler: z.string().min(1),
    datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    gesamtbetrag: z.number().positive(),
    waehrung: z.string().min(1).default("EUR"),
  }),
  betrag: z.number().positive(),
  nachricht: z.string().max(500).default(""),
});

export const UpdateStatusBody = z.object({
  status: z.enum(["accepted", "rejected", "cancelled"]),
  grund: z.string().max(500).optional(),
});

export const SearchQuerySchema = z.object({
  q: z.string().min(2).max(100),
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc -p server/tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/split-requests/schema.ts
git commit -m "feat: add split request Zod schemas"
```

---

### Task 4: Server — split-requests routes

**Files:**
- Create: `server/src/split-requests/routes.ts`

- [ ] **Step 1: Create the routes file**

Create `server/src/split-requests/routes.ts`:

```typescript
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/requireAuth.js";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { SplitRequestRepo } from "./repo.js";
import { CreateSplitRequestBody, UpdateStatusBody } from "./schema.js";
import { driveFor } from "../google/drive.js";
import { buildOAuth2ClientForRefreshToken } from "../google/client.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "split-requests" });

const createLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.session?.userId ?? req.ip) as string,
});

const previewLimit = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.session?.userId ?? req.ip) as string,
});

export function buildSplitRequestsRouter(
  config: Config,
  userRepo: UserRepo,
  splitRequestRepo: SplitRequestRepo
) {
  const router = Router();
  router.use(requireAuth);

  // GET /api/split-requests/incoming
  router.get("/incoming", (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const user = userRepo.getById(userId);
      if (!user) return res.status(401).json({ error: "unauthorized" });

      const requests = splitRequestRepo.listIncoming(userId);
      const enriched = requests.map((r) => {
        const fromUser = userRepo.getById(r.fromUserId);
        return {
          ...r,
          fromUser: fromUser ? { id: fromUser.id, name: fromUser.name, email: fromUser.email } : null,
        };
      });
      res.json({ requests: enriched });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/split-requests/outgoing
  router.get("/outgoing", (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const requests = splitRequestRepo.listOutgoing(userId);
      const enriched = requests.map((r) => {
        const toUser = userRepo.getById(r.toUserId);
        return {
          ...r,
          toUser: toUser ? { id: toUser.id, name: toUser.name, email: toUser.email } : null,
        };
      });
      res.json({ requests: enriched });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/split-requests/pending-count
  router.get("/pending-count", (req, res, next) => {
    try {
      const count = splitRequestRepo.countPendingIncoming(req.session.userId!);
      res.json({ count });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/split-requests/:id/receipt-preview
  router.get("/:id/receipt-preview", previewLimit, async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const splitReq = splitRequestRepo.getById(req.params.id);

      if (!splitReq) return res.status(404).json({ error: "not found" });
      if (splitReq.toUserId !== userId) return res.status(403).json({ error: "forbidden" });
      if (!["pending", "accepted"].includes(splitReq.status)) {
        return res.status(403).json({ error: "forbidden" });
      }

      const fromUser = userRepo.getById(splitReq.fromUserId);
      if (!fromUser?.refreshToken) {
        return res.status(503).json({ error: "source user unavailable" });
      }

      const auth = buildOAuth2ClientForRefreshToken(config.google, fromUser.refreshToken);
      const drive = driveFor(auth);

      // Get mimeType first
      const meta = await drive.files.get({ fileId: splitReq.receiptId, fields: "mimeType,name" });
      const mimeType = meta.data.mimeType ?? "application/octet-stream";

      // Stream the file
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

  // POST /api/split-requests
  router.post("/", createLimit, async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const parsed = CreateSplitRequestBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
      }

      const { toUserId, receiptId, receiptMeta, betrag, nachricht } = parsed.data;

      if (toUserId === userId) {
        return res.status(400).json({ error: "cannot request from yourself" });
      }

      const toUser = userRepo.getById(toUserId);
      if (!toUser) return res.status(404).json({ error: "target user not found" });

      // Verify the receipt belongs to the requesting user by attempting Drive access
      const fromUser = userRepo.getById(userId);
      if (!fromUser?.refreshToken) {
        return res.status(409).json({ error: "drive not configured" });
      }
      try {
        const auth = buildOAuth2ClientForRefreshToken(config.google, fromUser.refreshToken);
        const drive = driveFor(auth);
        await drive.files.get({ fileId: receiptId, fields: "id" });
      } catch {
        return res.status(400).json({ error: "receipt not accessible" });
      }

      const splitReq = splitRequestRepo.create({
        fromUserId: userId,
        toUserId,
        receiptId,
        receiptMeta,
        betrag,
        nachricht,
      });

      res.status(201).json({ request: splitReq });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/split-requests/:id/status
  router.patch("/:id/status", (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const parsed = UpdateStatusBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
      }

      const splitReq = splitRequestRepo.getById(req.params.id);
      if (!splitReq) return res.status(404).json({ error: "not found" });

      const { status } = parsed.data;

      if ((status === "accepted" || status === "rejected") && splitReq.toUserId !== userId) {
        return res.status(403).json({ error: "forbidden" });
      }
      if (status === "cancelled" && splitReq.fromUserId !== userId) {
        return res.status(403).json({ error: "forbidden" });
      }
      if (splitReq.status !== "pending") {
        return res.status(409).json({ error: "request already resolved" });
      }

      splitRequestRepo.updateStatus(req.params.id, status);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/split-requests/:id
  router.delete("/:id", (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const splitReq = splitRequestRepo.getById(req.params.id);
      if (!splitReq) return res.status(404).json({ error: "not found" });
      if (splitReq.fromUserId !== userId) return res.status(403).json({ error: "forbidden" });
      if (!["cancelled", "rejected"].includes(splitReq.status)) {
        return res.status(409).json({ error: "can only delete cancelled or rejected requests" });
      }
      splitRequestRepo.delete(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc -p server/tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/split-requests/routes.ts
git commit -m "feat: add split-requests express router"
```

---

### Task 5: Server — user search route

**Files:**
- Create: `server/src/users/searchRoutes.ts`

- [ ] **Step 1: Create the search routes file**

Create `server/src/users/searchRoutes.ts`:

```typescript
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/requireAuth.js";
import type { Db } from "../db/index.js";
import { SearchQuerySchema } from "../split-requests/schema.js";

const searchLimit = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.session?.userId ?? req.ip) as string,
});

export function buildUsersRouter(db: Db) {
  const router = Router();
  router.use(requireAuth);

  router.get("/search", searchLimit, (req, res, next) => {
    try {
      const parsed = SearchQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: "invalid query", details: parsed.error.flatten() });
      }

      const { q } = parsed.data;
      const pattern = `%${q}%`;
      const userId = req.session.userId!;

      const users = db
        .prepare(
          `SELECT id, name, email FROM users
           WHERE (name LIKE ? OR email LIKE ?) AND id != ?
           LIMIT 10`
        )
        .all(pattern, pattern, userId) as Array<{ id: string; name: string; email: string }>;

      res.json({ users });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc -p server/tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/users/searchRoutes.ts
git commit -m "feat: add user search route"
```

---

### Task 6: Server — wire up routes in app.ts

**Files:**
- Modify: `server/src/app.ts`

- [ ] **Step 1: Import and register the two new routers**

In `server/src/app.ts`, add the imports after the existing import for `buildBankRouter`:

```typescript
import { createSplitRequestRepo } from "./split-requests/repo.js";
import { buildSplitRequestsRouter } from "./split-requests/routes.js";
import { buildUsersRouter } from "./users/searchRoutes.js";
```

Then inside `createApp`, after `const userRepo = createUserRepo(deps.db);`, add:

```typescript
const splitRequestRepo = createSplitRequestRepo(deps.db);
```

Then after the existing `app.use("/api/bank", ...)` line, add:

```typescript
app.use("/api/split-requests", buildSplitRequestsRouter(deps.config, userRepo, splitRequestRepo));
app.use("/api/users", buildUsersRouter(deps.db));
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc -p server/tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 3: Start the server and verify endpoints exist**

```bash
# In one terminal: start server
npx tsx server/src/server.ts

# In another terminal (after logging in via browser to get a cookie):
curl -s http://localhost:3000/api/users/search?q=test -H "Cookie: connect.sid=<your-session>" | cat
```

Expected: `{"users":[...]}` (empty array if no matches, but no 500 error).

- [ ] **Step 4: Commit**

```bash
git add server/src/app.ts
git commit -m "feat: wire split-requests and user search routes into app"
```

---

### Task 7: Client — API client files

**Files:**
- Create: `client/src/api/splitRequests.ts`
- Create: `client/src/api/users.ts`

- [ ] **Step 1: Create splitRequests API client**

Create `client/src/api/splitRequests.ts`:

```typescript
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
  toUserId: string;
  receiptId: string;
  receiptMeta: ReceiptMeta;
  betrag: number;
  nachricht: string;
  status: SplitRequestStatus;
  createdAt: number;
  updatedAt: number;
};

export type IncomingRequest = SplitRequest & { fromUser: UserInfo | null };
export type OutgoingRequest = SplitRequest & { toUser: UserInfo | null };

export const splitRequestsApi = {
  incoming: () => api.get<{ requests: IncomingRequest[] }>("/api/split-requests/incoming"),

  outgoing: () => api.get<{ requests: OutgoingRequest[] }>("/api/split-requests/outgoing"),

  pendingCount: () => api.get<{ count: number }>("/api/split-requests/pending-count"),

  create: (payload: {
    toUserId: string;
    receiptId: string;
    receiptMeta: ReceiptMeta;
    betrag: number;
    nachricht: string;
  }) => api.post<{ request: SplitRequest }>("/api/split-requests", payload),

  updateStatus: (id: string, status: "accepted" | "rejected" | "cancelled") =>
    api.patch<{ ok: true }>(`/api/split-requests/${id}/status`, { status }),

  delete: (id: string) => api.delete<{ ok: true }>(`/api/split-requests/${id}`),

  receiptPreviewUrl: (id: string) => `/api/split-requests/${id}/receipt-preview`,
};
```

- [ ] **Step 2: Create users API client**

Create `client/src/api/users.ts`:

```typescript
import { api } from "./client";

export type UserSearchResult = { id: string; name: string; email: string };

export const usersApi = {
  search: (q: string) => api.get<{ users: UserSearchResult[] }>(`/api/users/search?q=${encodeURIComponent(q)}`),
};
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd C:\Development\beleg-manager
npx tsc -p client/tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/api/splitRequests.ts client/src/api/users.ts
git commit -m "feat: add split-requests and users API clients"
```

---

### Task 8: Client — TanStack Query hooks

**Files:**
- Create: `client/src/hooks/useSplitRequests.ts`
- Create: `client/src/hooks/useUserSearch.ts`

- [ ] **Step 1: Create useSplitRequests hook**

Create `client/src/hooks/useSplitRequests.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { splitRequestsApi } from "@/api/splitRequests";
import type { SplitRequestStatus } from "@/api/splitRequests";

export function useIncomingRequests() {
  return useQuery({
    queryKey: ["split-requests", "incoming"],
    queryFn: () => splitRequestsApi.incoming(),
    refetchInterval: 30_000,
  });
}

export function useOutgoingRequests() {
  return useQuery({
    queryKey: ["split-requests", "outgoing"],
    queryFn: () => splitRequestsApi.outgoing(),
    refetchInterval: 30_000,
  });
}

export function usePendingCount() {
  return useQuery({
    queryKey: ["split-requests", "pending-count"],
    queryFn: () => splitRequestsApi.pendingCount(),
    refetchInterval: 30_000,
    select: (data) => data.count,
  });
}

export function useUpdateRequestStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "accepted" | "rejected" | "cancelled" }) =>
      splitRequestsApi.updateStatus(id, status),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["split-requests"] });
    },
  });
}

export function useDeleteRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => splitRequestsApi.delete(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["split-requests"] });
    },
  });
}

export function useCreateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: splitRequestsApi.create,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["split-requests"] });
    },
  });
}
```

- [ ] **Step 2: Create useUserSearch hook**

Create `client/src/hooks/useUserSearch.ts`:

```typescript
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { usersApi } from "@/api/users";

export function useUserSearch() {
  const [inputValue, setInputValue] = useState("");
  const [debouncedValue, setDebouncedValue] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(inputValue), 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const query = useQuery({
    queryKey: ["user-search", debouncedValue],
    queryFn: () => usersApi.search(debouncedValue),
    enabled: debouncedValue.length >= 2,
  });

  return {
    inputValue,
    setInputValue,
    users: query.data?.users ?? [],
    isLoading: query.isFetching,
  };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc -p client/tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/hooks/useSplitRequests.ts client/src/hooks/useUserSearch.ts
git commit -m "feat: add split requests and user search hooks"
```

---

### Task 9: Client — RequestCard and ReceiptPreviewModal

**Files:**
- Create: `client/src/components/split-requests/RequestCard.tsx`
- Create: `client/src/components/split-requests/ReceiptPreviewModal.tsx`

- [ ] **Step 1: Create ReceiptPreviewModal**

Create `client/src/components/split-requests/ReceiptPreviewModal.tsx`:

```typescript
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { splitRequestsApi, type IncomingRequest } from "@/api/splitRequests";
import { formatCurrency, formatDateIso } from "@/lib/formatters";

type Props = {
  request: IncomingRequest;
  open: boolean;
  onClose: () => void;
};

export function ReceiptPreviewModal({ request, open, onClose }: Props) {
  const [imgError, setImgError] = useState(false);
  const previewUrl = splitRequestsApi.receiptPreviewUrl(request.id);
  const meta = request.receiptMeta;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl w-full">
        <DialogHeader>
          <DialogTitle>Beleg von {request.fromUser?.name ?? "Unbekannt"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1 min-h-48 bg-[var(--surface)] rounded-lg overflow-hidden flex items-center justify-center">
            {imgError ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Vorschau nicht verfügbar</p>
            ) : (
              <img
                src={previewUrl}
                alt="Beleg"
                className="max-w-full max-h-[500px] object-contain"
                onError={() => setImgError(true)}
              />
            )}
          </div>
          <div className="flex flex-col gap-3 min-w-[180px]">
            <div>
              <p className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-0.5">Händler</p>
              <p className="text-sm font-medium">{meta.haendler}</p>
            </div>
            <div>
              <p className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-0.5">Datum</p>
              <p className="text-sm font-medium">{formatDateIso(meta.datum)}</p>
            </div>
            <div>
              <p className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-0.5">Gesamtbetrag</p>
              <p className="text-sm font-medium">{formatCurrency(meta.gesamtbetrag, meta.waehrung)}</p>
            </div>
            <div>
              <p className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-0.5">Angeforderter Betrag</p>
              <p className="text-base font-bold text-[hsl(var(--foreground))]">{formatCurrency(request.betrag, meta.waehrung)}</p>
            </div>
            {request.nachricht && (
              <div>
                <p className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-0.5">Nachricht</p>
                <p className="text-sm">{request.nachricht}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create RequestCard**

Create `client/src/components/split-requests/RequestCard.tsx`:

```typescript
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import { useUpdateRequestStatus, useDeleteRequest } from "@/hooks/useSplitRequests";
import { useToast } from "@/components/ui/use-toast";
import { ReceiptPreviewModal } from "./ReceiptPreviewModal";
import type { IncomingRequest, OutgoingRequest } from "@/api/splitRequests";

const STATUS_LABELS: Record<string, string> = {
  pending: "Ausstehend",
  accepted: "Angenommen",
  rejected: "Abgelehnt",
  cancelled: "Zurückgezogen",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "default",
  accepted: "secondary",
  rejected: "destructive",
  cancelled: "outline",
};

type IncomingCardProps = { request: IncomingRequest };
type OutgoingCardProps = { request: OutgoingRequest };

export function IncomingRequestCard({ request }: IncomingCardProps) {
  const { toast } = useToast();
  const updateStatus = useUpdateRequestStatus();
  const [previewOpen, setPreviewOpen] = useState(false);

  async function handleStatus(status: "accepted" | "rejected") {
    try {
      await updateStatus.mutateAsync({ id: request.id, status });
      toast({ title: status === "accepted" ? "Angenommen" : "Abgelehnt" });
    } catch {
      toast({ title: "Fehler", variant: "destructive" });
    }
  }

  const meta = request.receiptMeta;

  return (
    <>
      <Card>
        <CardContent className="pt-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{request.fromUser?.name ?? "Unbekannt"}</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">{request.fromUser?.email}</p>
            </div>
            <Badge variant={STATUS_VARIANTS[request.status]}>{STATUS_LABELS[request.status]}</Badge>
          </div>
          <div className="flex gap-4 text-sm">
            <span className="font-medium">{meta.haendler}</span>
            <span className="text-[hsl(var(--muted-foreground))]">{formatDateIso(meta.datum)}</span>
            <span className="ml-auto font-bold">{formatCurrency(request.betrag, meta.waehrung)}</span>
          </div>
          {request.nachricht && (
            <p className="text-xs text-[hsl(var(--muted-foreground))] italic">„{request.nachricht}"</p>
          )}
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>
              Beleg ansehen
            </Button>
            {request.status === "pending" && (
              <>
                <Button
                  size="sm"
                  onClick={() => handleStatus("accepted")}
                  disabled={updateStatus.isPending}
                >
                  Annehmen
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleStatus("rejected")}
                  disabled={updateStatus.isPending}
                >
                  Ablehnen
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
      <ReceiptPreviewModal request={request} open={previewOpen} onClose={() => setPreviewOpen(false)} />
    </>
  );
}

export function OutgoingRequestCard({ request }: OutgoingCardProps) {
  const { toast } = useToast();
  const updateStatus = useUpdateRequestStatus();
  const deleteRequest = useDeleteRequest();
  const meta = request.receiptMeta;

  async function handleCancel() {
    try {
      await updateStatus.mutateAsync({ id: request.id, status: "cancelled" });
      toast({ title: "Zurückgezogen" });
    } catch {
      toast({ title: "Fehler", variant: "destructive" });
    }
  }

  async function handleDelete() {
    try {
      await deleteRequest.mutateAsync(request.id);
      toast({ title: "Gelöscht" });
    } catch {
      toast({ title: "Fehler", variant: "destructive" });
    }
  }

  return (
    <Card>
      <CardContent className="pt-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium">{request.toUser?.name ?? "Unbekannt"}</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{request.toUser?.email}</p>
          </div>
          <Badge variant={STATUS_VARIANTS[request.status]}>{STATUS_LABELS[request.status]}</Badge>
        </div>
        <div className="flex gap-4 text-sm">
          <span className="font-medium">{meta.haendler}</span>
          <span className="text-[hsl(var(--muted-foreground))]">{formatDateIso(meta.datum)}</span>
          <span className="ml-auto font-bold">{formatCurrency(request.betrag, meta.waehrung)}</span>
        </div>
        {request.nachricht && (
          <p className="text-xs text-[hsl(var(--muted-foreground))] italic">„{request.nachricht}"</p>
        )}
        <div className="flex gap-2 pt-1">
          {request.status === "pending" && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancel}
              disabled={updateStatus.isPending}
            >
              Zurückziehen
            </Button>
          )}
          {["cancelled", "rejected"].includes(request.status) && (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteRequest.isPending}
            >
              Löschen
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc -p client/tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/split-requests/
git commit -m "feat: add RequestCard and ReceiptPreviewModal components"
```

---

### Task 10: Client — List components and CreateRequestDialog

**Files:**
- Create: `client/src/components/split-requests/IncomingList.tsx`
- Create: `client/src/components/split-requests/OutgoingList.tsx`
- Create: `client/src/components/split-requests/CreateRequestDialog.tsx`

- [ ] **Step 1: Create IncomingList**

Create `client/src/components/split-requests/IncomingList.tsx`:

```typescript
import { useIncomingRequests } from "@/hooks/useSplitRequests";
import { IncomingRequestCard } from "./RequestCard";
import { Skeleton } from "@/components/ui/skeleton";

export function IncomingList() {
  const { data, isLoading } = useIncomingRequests();
  const requests = data?.requests ?? [];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="text-center py-12 text-[hsl(var(--muted-foreground))] text-sm">
        Keine eingehenden Anforderungen
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {requests.map((r) => <IncomingRequestCard key={r.id} request={r} />)}
    </div>
  );
}
```

- [ ] **Step 2: Create OutgoingList**

Create `client/src/components/split-requests/OutgoingList.tsx`:

```typescript
import { useOutgoingRequests } from "@/hooks/useSplitRequests";
import { OutgoingRequestCard } from "./RequestCard";
import { Skeleton } from "@/components/ui/skeleton";

export function OutgoingList() {
  const { data, isLoading } = useOutgoingRequests();
  const requests = data?.requests ?? [];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="text-center py-12 text-[hsl(var(--muted-foreground))] text-sm">
        Keine ausgehenden Anforderungen
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {requests.map((r) => <OutgoingRequestCard key={r.id} request={r} />)}
    </div>
  );
}
```

- [ ] **Step 3: Create CreateRequestDialog**

Create `client/src/components/split-requests/CreateRequestDialog.tsx`:

```typescript
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command";
import { useUserSearch } from "@/hooks/useUserSearch";
import { useCreateRequest } from "@/hooks/useSplitRequests";
import { useToast } from "@/components/ui/use-toast";
import type { ReceiptMeta } from "@/api/splitRequests";
import type { UserSearchResult } from "@/api/users";

type Props = {
  open: boolean;
  onClose: () => void;
  receiptId: string;
  receiptMeta: ReceiptMeta;
};

export function CreateRequestDialog({ open, onClose, receiptId, receiptMeta }: Props) {
  const { toast } = useToast();
  const { inputValue, setInputValue, users, isLoading } = useUserSearch();
  const createRequest = useCreateRequest();
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [betrag, setBetrag] = useState("");
  const [nachricht, setNachricht] = useState("");

  function handleClose() {
    setSelectedUser(null);
    setBetrag("");
    setNachricht("");
    setInputValue("");
    onClose();
  }

  async function handleSubmit() {
    if (!selectedUser || !betrag) return;
    const betragNum = parseFloat(betrag);
    if (isNaN(betragNum) || betragNum <= 0) return;

    try {
      await createRequest.mutateAsync({
        toUserId: selectedUser.id,
        receiptId,
        receiptMeta,
        betrag: betragNum,
        nachricht,
      });
      toast({ title: "Anforderung gesendet" });
      handleClose();
    } catch {
      toast({ title: "Fehler beim Senden", variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Aufteilung anfordern</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <Label className="mb-1.5 block text-sm">Nutzer suchen</Label>
            {selectedUser ? (
              <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{selectedUser.name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{selectedUser.email}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setSelectedUser(null)}>Ändern</Button>
              </div>
            ) : (
              <Command className="rounded-lg border border-[hsl(var(--border))]">
                <CommandInput
                  placeholder="Name oder E-Mail eingeben..."
                  value={inputValue}
                  onValueChange={setInputValue}
                />
                <CommandList>
                  {inputValue.length >= 2 && !isLoading && users.length === 0 && (
                    <CommandEmpty>Kein Nutzer gefunden</CommandEmpty>
                  )}
                  {users.map((u) => (
                    <CommandItem
                      key={u.id}
                      value={u.email}
                      onSelect={() => setSelectedUser(u)}
                    >
                      <div>
                        <p className="text-sm font-medium">{u.name}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">{u.email}</p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            )}
          </div>
          <div>
            <Label htmlFor="betrag" className="mb-1.5 block text-sm">Angeforderter Betrag ({receiptMeta.waehrung})</Label>
            <Input
              id="betrag"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={betrag}
              onChange={(e) => setBetrag(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="nachricht" className="mb-1.5 block text-sm">Nachricht (optional)</Label>
            <Input
              id="nachricht"
              placeholder="z.B. Anteil Mittagessen"
              value={nachricht}
              maxLength={500}
              onChange={(e) => setNachricht(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Abbrechen</Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedUser || !betrag || createRequest.isPending}
          >
            Anforderung senden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc -p client/tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/split-requests/
git commit -m "feat: add IncomingList, OutgoingList, and CreateRequestDialog components"
```

---

### Task 11: Client — RequestsPage and routing

**Files:**
- Create: `client/src/pages/Requests.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Create the RequestsPage**

Create `client/src/pages/Requests.tsx`:

```typescript
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IncomingList } from "@/components/split-requests/IncomingList";
import { OutgoingList } from "@/components/split-requests/OutgoingList";
import { usePendingCount } from "@/hooks/useSplitRequests";

export function RequestsPage() {
  const pendingCount = usePendingCount();
  const count = pendingCount.data ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Anforderungen</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
          Aufteilungsanforderungen von und an andere Nutzer
        </p>
      </div>
      <Tabs defaultValue="incoming">
        <TabsList>
          <TabsTrigger value="incoming" className="flex items-center gap-2">
            Eingehend
            {count > 0 && (
              <span className="ml-1 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none">
                {count}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="outgoing">Ausgehend</TabsTrigger>
        </TabsList>
        <TabsContent value="incoming" className="mt-4">
          <IncomingList />
        </TabsContent>
        <TabsContent value="outgoing" className="mt-4">
          <OutgoingList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Add /requests route to App.tsx**

In `client/src/App.tsx`, add the import:

```typescript
import { RequestsPage } from "@/pages/Requests";
```

Inside the `<Route element={<ProtectedRoute>...}>` block, add after the `/splits` route:

```typescript
<Route path="/requests" element={<RequestsPage />} />
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc -p client/tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Requests.tsx client/src/App.tsx
git commit -m "feat: add RequestsPage and /requests route"
```

---

### Task 12: Client — AppShell navigation

**Files:**
- Modify: `client/src/components/AppShell.tsx`

- [ ] **Step 1: Add Anforderungen to navItems with pending badge**

In `client/src/components/AppShell.tsx`:

1. Add the import for the new hook at the top with the other imports:

```typescript
import { usePendingCount } from "@/hooks/useSplitRequests";
```

2. Add `HandCoins` to the lucide-react import (replace the existing import line):

```typescript
import { LayoutDashboard, PlusCircle, Settings, Sun, Moon, LogOut, Bell, Zap, Receipt, SplitSquareHorizontal, ArrowLeftRight, MoreHorizontal, X, HandCoins } from "lucide-react";
```

3. Add the new nav item to `navItems` array after the `/splits` entry:

```typescript
{ to: "/requests", label: "Anforderungen", icon: HandCoins },
```

4. Inside the `AppShell` function body, after the existing `failedCount` lines, add:

```typescript
const { data: pendingCountData } = usePendingCount();
const pendingRequestCount = pendingCountData ?? 0;
```

5. In the desktop sidebar nav render, add a badge condition for `/requests` (add after the existing `/upload` badge block inside the map):

```typescript
{item.to === "/requests" && pendingRequestCount > 0 && (
  <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold">
    {pendingRequestCount}
  </span>
)}
```

6. Add `/requests` to the `PAGE_TITLES` map:

```typescript
"/requests": "Anforderungen",
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc -p client/tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/AppShell.tsx
git commit -m "feat: add Anforderungen nav item with pending badge to AppShell"
```

---

### Task 13: Update progress tracker and context

**Files:**
- Modify: `context/progress-tracker.md`

- [ ] **Step 1: Update the progress tracker**

In `context/progress-tracker.md`, update the Completed section and Architecture Decisions:

```markdown
## Completed

- Relocated Account feature from Sidebar to Top Header dropdown.
- Implemented responsive account dropdown with user info, settings link, and logout.
- Refactored Dashboard into a premium "state-of-the-art" admin layout.
- Removed receipts table from the dashboard to focus on analytics.
- Implemented mobile-optimized "List/Card" view for the receipts page.
- Added user-configurable default view mode (Table vs. List) in settings.
- Implemented user-configurable start page after login.
- Implemented multi-tenant cross-user split requests with receipt proxy preview.

## Architecture Decisions

- Added `receipts_view_mode` and `start_page` to the `users` table to persist UI preferences across sessions/devices.
- Updated `/api/settings/ui` and `/api/auth/me` endpoints to include UI-specific user configurations.
- Added `split_requests` SQLite table for cross-user Aufteilungsanforderungen. Cross-user coordination is an app-level concern, stored in SQLite not Google Sheets.
- Receipt previews served via server-side proxy using from_user's refresh token — to_user never gets Drive access directly.
- User search endpoint returns only {id, name, email} — no internal fields ever exposed.
```

- [ ] **Step 2: Commit**

```bash
git add context/progress-tracker.md
git commit -m "docs: update progress tracker after split requests implementation"
```

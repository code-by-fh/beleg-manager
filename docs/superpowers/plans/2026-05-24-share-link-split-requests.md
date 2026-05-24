# Share-Link für Anforderungen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ersteller können für eine Person einen zeitlich begrenzten (20 Tage) Share-Link generieren, der alle ihre Anforderungen öffentlich (ohne Login) lesbar macht; Drive-Belege werden per E-Mail geteilt.

**Architecture:** Ein kryptografischer Token (256 Bit) wird in einer neuen `share_links`-Tabelle gespeichert. Ein öffentlicher GET-Endpoint gibt minimale Daten zurück. Ein authentifizierter POST-Endpoint erstellt/erneuert den Token, teilt Drive-Dateien mit `drive.permissions.create`, und sendet den Link per Gmail-API des Owners. Das Frontend hat eine öffentliche `/share/:token`-Seite außerhalb der `ProtectedRoute`.

**Tech Stack:** Node.js/Express, better-sqlite3, googleapis (Drive v3 + Gmail v1), Zod, React + TanStack Query, React Router, Tailwind/Radix UI, Vitest + supertest

---

## File Map

| Aktion | Pfad |
|--------|------|
| Modify | `server/src/db/migrations.ts` |
| Create | `server/src/share-links/repo.ts` |
| Create | `server/src/share-links/schema.ts` |
| Create | `server/src/share-links/service.ts` |
| Create | `server/src/share-links/routes.ts` |
| Modify | `server/src/app.ts` |
| Create | `server/test/shareLinksRepo.test.ts` |
| Create | `server/test/shareLinksRoutes.test.ts` |
| Create | `client/src/api/shareLinks.ts` |
| Create | `client/src/hooks/useShareLinks.ts` |
| Create | `client/src/components/split-requests/ShareLinkDialog.tsx` |
| Modify | `client/src/components/split-requests/MyAufteilungenList.tsx` |
| Create | `client/src/pages/SharePage.tsx` |
| Modify | `client/src/App.tsx` |

---

## Task 1: DB-Migration — `share_links`-Tabelle

**Files:**
- Modify: `server/src/db/migrations.ts`

- [ ] **Step 1: Migration hinzufügen**

Füge am Ende von `runMigrations` in `server/src/db/migrations.ts` hinzu (nach dem `service_health`-Block):

```typescript
  db.exec(`
    CREATE TABLE IF NOT EXISTS share_links (
      id           TEXT PRIMARY KEY,
      token        TEXT NOT NULL UNIQUE,
      from_user_id TEXT NOT NULL,
      person_name  TEXT NOT NULL,
      person_email TEXT NOT NULL,
      created_at   INTEGER NOT NULL,
      expires_at   INTEGER NOT NULL,
      FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_share_links_owner ON share_links(from_user_id, person_email)`);
```

- [ ] **Step 2: Commit**

```bash
git add server/src/db/migrations.ts
git commit -m "feat(db): add share_links table"
```

---

## Task 2: Repo — `server/src/share-links/repo.ts`

**Files:**
- Create: `server/src/share-links/repo.ts`
- Create: `server/test/shareLinksRepo.test.ts`

- [ ] **Step 1: Failing test schreiben**

Erstelle `server/test/shareLinksRepo.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { openDatabase } from "../src/db/index.js";
import { runMigrations } from "../src/db/migrations.js";
import { createShareLinkRepo } from "../src/share-links/repo.js";

describe("shareLinkRepo", () => {
  let repo: ReturnType<typeof createShareLinkRepo>;

  beforeEach(() => {
    const db = openDatabase(":memory:");
    runMigrations(db);
    repo = createShareLinkRepo(db);
  });

  it("creates a share link and reads it back by token", () => {
    const link = repo.create({
      fromUserId: "user1",
      personName: "Alice",
      personEmail: "alice@example.com",
    });
    expect(link.fromUserId).toBe("user1");
    expect(link.personEmail).toBe("alice@example.com");
    expect(link.token).toHaveLength(43);
    expect(link.expiresAt).toBeGreaterThan(Date.now());

    const found = repo.getByToken(link.token);
    expect(found?.id).toBe(link.id);
  });

  it("upsert renews token for same owner+email", () => {
    const a = repo.create({ fromUserId: "u1", personName: "Bob", personEmail: "bob@x.de" });
    const b = repo.upsert({ fromUserId: "u1", personName: "Bob", personEmail: "bob@x.de" });
    expect(a.id).toBe(b.id);
    expect(b.token).not.toBe(a.token);
  });

  it("listByOwner returns only owner links", () => {
    repo.create({ fromUserId: "u1", personName: "A", personEmail: "a@x.de" });
    repo.create({ fromUserId: "u2", personName: "B", personEmail: "b@x.de" });
    const links = repo.listByOwner("u1");
    expect(links).toHaveLength(1);
    expect(links[0]!.personEmail).toBe("a@x.de");
  });

  it("delete removes the link", () => {
    const link = repo.create({ fromUserId: "u1", personName: "C", personEmail: "c@x.de" });
    repo.delete(link.id, "u1");
    expect(repo.getByToken(link.token)).toBeUndefined();
  });

  it("delete does not remove link owned by someone else", () => {
    const link = repo.create({ fromUserId: "u1", personName: "D", personEmail: "d@x.de" });
    repo.delete(link.id, "u2");
    expect(repo.getByToken(link.token)).toBeDefined();
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

```bash
cd server && npx vitest run test/shareLinksRepo.test.ts
```

Erwartet: FAIL wegen „Cannot find module"

- [ ] **Step 3: Repo implementieren**

Erstelle `server/src/share-links/repo.ts`:

```typescript
import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "../db/index.js";

export type ShareLinkRow = {
  id: string;
  token: string;
  fromUserId: string;
  personName: string;
  personEmail: string;
  createdAt: number;
  expiresAt: number;
};

const TWENTY_DAYS_MS = 20 * 24 * 60 * 60 * 1000;

const SELECT_COLS = `
  id, token,
  from_user_id  AS fromUserId,
  person_name   AS personName,
  person_email  AS personEmail,
  created_at    AS createdAt,
  expires_at    AS expiresAt
`;

function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function createShareLinkRepo(db: Db) {
  return {
    create(input: { fromUserId: string; personName: string; personEmail: string }): ShareLinkRow {
      const now = Date.now();
      const id = uuidv4();
      const token = generateToken();
      db.prepare(
        `INSERT INTO share_links (id, token, from_user_id, person_name, person_email, created_at, expires_at)
         VALUES (@id, @token, @fromUserId, @personName, @personEmail, @now, @expiresAt)`
      ).run({ id, token, fromUserId: input.fromUserId, personName: input.personName, personEmail: input.personEmail, now, expiresAt: now + TWENTY_DAYS_MS });
      return this.getById(id)!;
    },

    upsert(input: { fromUserId: string; personName: string; personEmail: string }): ShareLinkRow {
      const existing = db.prepare(
        `SELECT ${SELECT_COLS} FROM share_links WHERE from_user_id = ? AND person_email = ?`
      ).get(input.fromUserId, input.personEmail) as ShareLinkRow | undefined;

      const now = Date.now();
      const newToken = generateToken();
      const newExpiry = now + TWENTY_DAYS_MS;

      if (existing) {
        db.prepare(
          `UPDATE share_links SET token = ?, person_name = ?, created_at = ?, expires_at = ? WHERE id = ?`
        ).run(newToken, input.personName, now, newExpiry, existing.id);
        return this.getById(existing.id)!;
      }
      return this.create(input);
    },

    getByToken(token: string): ShareLinkRow | undefined {
      const rows = db.prepare(
        `SELECT ${SELECT_COLS} FROM share_links WHERE LENGTH(token) = ?`
      ).all(token.length) as ShareLinkRow[];
      for (const row of rows) {
        const a = Buffer.from(row.token);
        const b = Buffer.from(token);
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) return row;
      }
      return undefined;
    },

    getById(id: string): ShareLinkRow | undefined {
      return db.prepare(`SELECT ${SELECT_COLS} FROM share_links WHERE id = ?`).get(id) as ShareLinkRow | undefined;
    },

    listByOwner(fromUserId: string): ShareLinkRow[] {
      return db.prepare(
        `SELECT ${SELECT_COLS} FROM share_links WHERE from_user_id = ? ORDER BY created_at DESC`
      ).all(fromUserId) as ShareLinkRow[];
    },

    delete(id: string, fromUserId: string): boolean {
      const result = db.prepare(
        `DELETE FROM share_links WHERE id = ? AND from_user_id = ?`
      ).run(id, fromUserId);
      return result.changes > 0;
    },
  };
}

export type ShareLinkRepo = ReturnType<typeof createShareLinkRepo>;
```

- [ ] **Step 4: Tests ausführen — müssen bestehen**

```bash
cd server && npx vitest run test/shareLinksRepo.test.ts
```

Erwartet: 5 passed

- [ ] **Step 5: Commit**

```bash
git add server/src/share-links/repo.ts server/test/shareLinksRepo.test.ts
git commit -m "feat(share-links): add repo with timing-safe token lookup"
```

---

## Task 3: Schema — `server/src/share-links/schema.ts`

**Files:**
- Create: `server/src/share-links/schema.ts`

- [ ] **Step 1: Schema erstellen**

Erstelle `server/src/share-links/schema.ts`:

```typescript
import { z } from "zod";

export const CreateShareLinkBody = z.object({
  personName: z.string().min(1).max(200),
  personEmail: z.string().email(),
});

export const TokenParams = z.object({
  token: z.string().min(1).max(100),
});

export const IdParams = z.object({
  id: z.string().uuid(),
});
```

- [ ] **Step 2: Commit**

```bash
git add server/src/share-links/schema.ts
git commit -m "feat(share-links): add Zod schemas"
```

---

## Task 4: Service — Drive-Freigabe & Gmail-Versand

**Files:**
- Create: `server/src/share-links/service.ts`

- [ ] **Step 1: Service erstellen**

Erstelle `server/src/share-links/service.ts`:

```typescript
import { google } from "googleapis";
import { buildOAuth2ClientForRefreshToken, type GoogleCfg } from "../google/client.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "share-links-service" });

export async function shareReceiptsWithEmail(
  cfg: GoogleCfg,
  refreshToken: string,
  receiptIds: string[],
  personEmail: string,
): Promise<void> {
  const auth = buildOAuth2ClientForRefreshToken(cfg, refreshToken);
  const drive = google.drive({ version: "v3", auth });

  for (const fileId of receiptIds) {
    try {
      await drive.permissions.create({
        fileId,
        requestBody: { role: "reader", type: "user", emailAddress: personEmail },
        sendNotificationEmail: false,
      });
    } catch (err) {
      log.warn({ err, fileId, personEmail }, "drive share permission failed (non-fatal)");
    }
  }
}

function buildMimeMessage(opts: {
  from: string;
  to: string;
  ownerName: string;
  personName: string;
  shareUrl: string;
  expiresAt: number;
}): string {
  const expiryDate = new Date(opts.expiresAt).toLocaleDateString("de-DE", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const body = [
    `Hallo ${opts.personName},`,
    ``,
    `${opts.ownerName} hat dir eine Übersicht deiner offenen Anforderungen geteilt.`,
    ``,
    `Hier kannst du alle Details einsehen:`,
    opts.shareUrl,
    ``,
    `Der Link ist gültig bis: ${expiryDate}`,
    ``,
    `Falls Belege angehängt sind, sind diese für deine Google-Adresse (${opts.to}) freigegeben.`,
  ].join("\n");

  const raw = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: Deine Anforderungen von ${opts.ownerName}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    body,
  ].join("\r\n");

  return Buffer.from(raw).toString("base64url");
}

export async function sendShareLinkEmail(
  cfg: GoogleCfg,
  refreshToken: string,
  opts: {
    ownerEmail: string;
    ownerName: string;
    personName: string;
    personEmail: string;
    shareUrl: string;
    expiresAt: number;
  },
): Promise<void> {
  const auth = buildOAuth2ClientForRefreshToken(cfg, refreshToken);
  const gmail = google.gmail({ version: "v1", auth });

  const raw = buildMimeMessage({
    from: opts.ownerEmail,
    to: opts.personEmail,
    ownerName: opts.ownerName,
    personName: opts.personName,
    shareUrl: opts.shareUrl,
    expiresAt: opts.expiresAt,
  });

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/share-links/service.ts
git commit -m "feat(share-links): add Drive sharing and Gmail send helpers"
```

---

## Task 5: Routes — `server/src/share-links/routes.ts`

**Files:**
- Create: `server/src/share-links/routes.ts`
- Create: `server/test/shareLinksRoutes.test.ts`

- [ ] **Step 1: Failing-Test schreiben**

Erstelle `server/test/shareLinksRoutes.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { openDatabase } from "../src/db/index.js";
import { runMigrations } from "../src/db/migrations.js";
import { createShareLinkRepo } from "../src/share-links/repo.js";
import { createSplitRequestRepo } from "../src/split-requests/repo.js";
import { buildShareLinksRouter } from "../src/share-links/routes.js";
import express from "express";
import { TEST_CONFIG } from "./helpers/buildTestApp.js";

function makeApp() {
  const db = openDatabase(":memory:");
  runMigrations(db);
  const shareLinkRepo = createShareLinkRepo(db);
  const splitRequestRepo = createSplitRequestRepo(db);

  // insert a test user
  db.prepare(
    `INSERT INTO users (id, email, name, refresh_token, created_at)
     VALUES ('u1', 'owner@test.de', 'Owner', 'rt1', ${Date.now()})`
  ).run();

  const app = express();
  app.use(express.json());

  // stub session
  app.use((req, _res, next) => {
    (req as unknown as Record<string, unknown>).session = { userId: "u1" };
    next();
  });

  const router = buildShareLinksRouter({
    config: TEST_CONFIG,
    db,
    shareLinkRepo,
    splitRequestRepo,
    shareReceiptsWithEmail: vi.fn().mockResolvedValue(undefined),
    sendShareLinkEmail: vi.fn().mockResolvedValue(undefined),
    clientOrigin: "http://localhost:5173",
  });
  app.use("/api/share-links", router);
  return { app, db, shareLinkRepo };
}

describe("share-links routes", () => {
  it("POST /api/share-links creates a link and returns shareUrl", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/api/share-links")
      .send({ personName: "Alice", personEmail: "alice@example.com" });
    expect(res.status).toBe(201);
    expect(res.body.shareUrl).toMatch(/\/share\//);
    expect(res.body.expiresAt).toBeGreaterThan(Date.now());
  });

  it("GET /api/share-links/:token returns split requests for valid token", async () => {
    const { app, db, shareLinkRepo } = makeApp();
    const link = shareLinkRepo.create({
      fromUserId: "u1",
      personName: "Bob",
      personEmail: "bob@example.com",
    });

    // insert a split request for this person
    db.prepare(
      `INSERT INTO split_requests
        (id, from_user_id, to_user_id, free_name, receipt_id, receipt_sqlite_id,
         receipt_meta, betrag, nachricht, status, created_at, updated_at)
       VALUES ('sr1', 'u1', NULL, 'Bob', NULL, NULL,
               '{"haendler":"Aldi","datum":"2024-01-10","gesamtbetrag":20,"waehrung":"EUR"}',
               10, 'Test', 'pending', ${Date.now()}, ${Date.now()})`
    ).run();

    const res = await request(app).get(`/api/share-links/${link.token}`);
    expect(res.status).toBe(200);
    expect(res.body.personName).toBe("Bob");
    expect(res.body.requests).toHaveLength(1);
    expect(res.body.requests[0]).not.toHaveProperty("fromUserId");
    expect(res.body.requests[0]).not.toHaveProperty("id");
    expect(res.body.requests[0].haendler).toBe("Aldi");
  });

  it("GET /api/share-links/:token returns 410 for expired token", async () => {
    const { app, db } = makeApp();
    const { v4: uuidv4 } = await import("uuid");
    const crypto = await import("node:crypto");
    db.prepare(
      `INSERT INTO share_links (id, token, from_user_id, person_name, person_email, created_at, expires_at)
       VALUES (?, ?, 'u1', 'Old', 'old@x.de', ?, ?)`
    ).run(uuidv4(), crypto.randomBytes(32).toString("base64url"), Date.now() - 1000, Date.now() - 1);

    const rows = db.prepare("SELECT token FROM share_links WHERE person_email = 'old@x.de'").all() as Array<{ token: string }>;
    const res = await request(app).get(`/api/share-links/${rows[0]!.token}`);
    expect(res.status).toBe(410);
  });

  it("GET /api/share-links/:token returns 404 for unknown token", async () => {
    const { app } = makeApp();
    const crypto = await import("node:crypto");
    const fakeToken = crypto.randomBytes(32).toString("base64url");
    const res = await request(app).get(`/api/share-links/${fakeToken}`);
    expect(res.status).toBe(404);
  });

  it("DELETE /api/share-links/:id removes own link", async () => {
    const { app, shareLinkRepo } = makeApp();
    const link = shareLinkRepo.create({ fromUserId: "u1", personName: "X", personEmail: "x@x.de" });
    const res = await request(app).delete(`/api/share-links/${link.id}`);
    expect(res.status).toBe(200);
    expect(shareLinkRepo.getByToken(link.token)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

```bash
cd server && npx vitest run test/shareLinksRoutes.test.ts
```

Erwartet: FAIL wegen „Cannot find module"

- [ ] **Step 3: Routes implementieren**

Erstelle `server/src/share-links/routes.ts`:

```typescript
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/requireAuth.js";
import type { Config } from "../config.js";
import type { Db } from "../db/index.js";
import type { ShareLinkRepo } from "./repo.js";
import type { SplitRequestRepo } from "../split-requests/repo.js";
import { CreateShareLinkBody, TokenParams, IdParams } from "./schema.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "share-links" });

const createLimit = rateLimit({
  windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => (req.session?.userId ?? req.ip) as string,
});

const publicReadLimit = rateLimit({
  windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.ip as string,
});

export type ShareLinksRouterDeps = {
  config: Config;
  db: Db;
  shareLinkRepo: ShareLinkRepo;
  splitRequestRepo: SplitRequestRepo;
  shareReceiptsWithEmail: (cfg: Config["google"], refreshToken: string, receiptIds: string[], email: string) => Promise<void>;
  sendShareLinkEmail: (cfg: Config["google"], refreshToken: string, opts: {
    ownerEmail: string; ownerName: string; personName: string; personEmail: string;
    shareUrl: string; expiresAt: number;
  }) => Promise<void>;
  clientOrigin: string;
};

export function buildShareLinksRouter(deps: ShareLinksRouterDeps) {
  const { config, db, shareLinkRepo, splitRequestRepo } = deps;
  const router = Router();

  // Public endpoint — no auth
  router.get("/:token", publicReadLimit, (req, res, next) => {
    try {
      const parsed = TokenParams.safeParse(req.params);
      if (!parsed.success) return res.status(400).json({ error: "invalid token" });

      const link = shareLinkRepo.getByToken(parsed.data.token);
      if (!link) return res.status(404).json({ error: "not found" });
      if (link.expiresAt <= Date.now()) return res.status(410).json({ error: "link expired" });

      const allRequests = splitRequestRepo.listOutgoing(link.fromUserId);

      // Build email map for registered users so we can match by email
      const userEmailMap = new Map<string, string>();
      const toUserIds = allRequests
        .map((r) => r.toUserId)
        .filter((id): id is string => id !== null);
      if (toUserIds.length > 0) {
        const placeholders = toUserIds.map(() => "?").join(",");
        (db.prepare(`SELECT id, email FROM users WHERE id IN (${placeholders})`).all(...toUserIds) as Array<{ id: string; email: string }>)
          .forEach((u) => userEmailMap.set(u.id, u.email));
      }

      const filtered = allRequests.filter((r) => {
        if (r.freeName) {
          return r.freeName.toLowerCase() === link.personName.toLowerCase();
        }
        if (r.toUserId) {
          return userEmailMap.get(r.toUserId) === link.personEmail;
        }
        return false;
      });

      const requests = filtered.map((r) => ({
        haendler: r.receiptMeta.haendler,
        datum: r.receiptMeta.datum,
        betrag: r.betrag,
        waehrung: r.receiptMeta.waehrung,
        nachricht: r.nachricht,
        status: r.status,
        driveFileUrl: r.receiptId
          ? `https://drive.google.com/file/d/${r.receiptId}/view`
          : null,
      }));

      res.json({ personName: link.personName, requests, expiresAt: link.expiresAt });
    } catch (err) { next(err); }
  });

  // All routes below require auth
  router.use(requireAuth);

  router.post("/", createLimit, async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const parsed = CreateShareLinkBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });

      const { personName, personEmail } = parsed.data;

      const owner = db.prepare(
        `SELECT id, email, name, refresh_token AS refreshToken FROM users WHERE id = ?`
      ).get(userId) as { id: string; email: string; name: string; refreshToken: string | null } | undefined;
      if (!owner?.refreshToken) return res.status(409).json({ error: "drive not configured" });

      // Share all Drive receipts for this person
      const outgoing = splitRequestRepo.listOutgoing(userId);
      const personRequests = outgoing.filter((r) => {
        if (r.freeName) return r.freeName.toLowerCase() === personName.toLowerCase();
        // for toUserId persons, match by email
        return false; // will be handled via email matching in the GET route; Drive sharing still works
      });
      const receiptIds = personRequests
        .map((r) => r.receiptId)
        .filter((id): id is string => id !== null);

      if (receiptIds.length > 0) {
        await deps.shareReceiptsWithEmail(config.google, owner.refreshToken, receiptIds, personEmail);
      }

      const link = shareLinkRepo.upsert({ fromUserId: userId, personName, personEmail });
      const shareUrl = `${deps.clientOrigin}/share/${link.token}`;

      await deps.sendShareLinkEmail(config.google, owner.refreshToken, {
        ownerEmail: owner.email,
        ownerName: owner.name,
        personName,
        personEmail,
        shareUrl,
        expiresAt: link.expiresAt,
      });

      log.info({ linkId: link.id, personEmail }, "share link created/renewed");
      res.status(201).json({ shareUrl, expiresAt: link.expiresAt });
    } catch (err) { next(err); }
  });

  router.get("/", (req, res, next) => {
    try {
      const links = shareLinkRepo.listByOwner(req.session.userId!);
      res.json({ links: links.map((l) => ({ id: l.id, personName: l.personName, personEmail: l.personEmail, expiresAt: l.expiresAt })) });
    } catch (err) { next(err); }
  });

  router.delete("/:id", (req, res, next) => {
    try {
      const parsed = IdParams.safeParse(req.params);
      if (!parsed.success) return res.status(400).json({ error: "invalid id" });
      const deleted = shareLinkRepo.delete(parsed.data.id, req.session.userId!);
      if (!deleted) return res.status(404).json({ error: "not found" });
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
}
```

- [ ] **Step 4: Tests ausführen — müssen bestehen**

```bash
cd server && npx vitest run test/shareLinksRoutes.test.ts
```

Erwartet: 5 passed

- [ ] **Step 5: Commit**

```bash
git add server/src/share-links/routes.ts server/test/shareLinksRoutes.test.ts
git commit -m "feat(share-links): add routes with public GET and authenticated POST/DELETE"
```

---

## Task 6: App.ts — Router registrieren

**Files:**
- Modify: `server/src/app.ts`

- [ ] **Step 1: Imports und Router hinzufügen**

Füge in `server/src/app.ts` die folgenden Importe hinzu (nach dem `buildUsersRouter`-Import):

```typescript
import { createShareLinkRepo } from "./share-links/repo.js";
import { buildShareLinksRouter } from "./share-links/routes.js";
import { shareReceiptsWithEmail, sendShareLinkEmail } from "./share-links/service.js";
```

Füge in der `createApp`-Funktion nach `const splitRequestRepo = ...` hinzu:

```typescript
  const shareLinkRepo = createShareLinkRepo(deps.db);
```

Füge nach `app.use("/api/users", ...)` hinzu:

```typescript
  app.use("/api/share-links", buildShareLinksRouter({
    config: deps.config,
    db: deps.db,
    shareLinkRepo,
    splitRequestRepo,
    shareReceiptsWithEmail,
    sendShareLinkEmail,
    clientOrigin: deps.config.clientOrigin,
  }));
```

- [ ] **Step 2: TypeScript kompilieren**

```bash
cd server && npx tsc --noEmit
```

Erwartet: keine Fehler

- [ ] **Step 3: Alle Tests ausführen**

```bash
cd server && npx vitest run
```

Erwartet: alle Tests bestehen

- [ ] **Step 4: Commit**

```bash
git add server/src/app.ts
git commit -m "feat(share-links): register router in app"
```

---

## Task 7: Client API — `client/src/api/shareLinks.ts`

**Files:**
- Create: `client/src/api/shareLinks.ts`

- [ ] **Step 1: API-Client erstellen**

Erstelle `client/src/api/shareLinks.ts`:

```typescript
import { api } from "./client";

export type ShareLinkInfo = {
  id: string;
  personName: string;
  personEmail: string;
  expiresAt: number;
};

export type PublicSplitRequestItem = {
  haendler: string;
  datum: string;
  betrag: number;
  waehrung: string;
  nachricht: string;
  status: string;
  driveFileUrl: string | null;
};

export type PublicShareData = {
  personName: string;
  requests: PublicSplitRequestItem[];
  expiresAt: number;
};

export const shareLinksApi = {
  create: (payload: { personName: string; personEmail: string }) =>
    api.post<{ shareUrl: string; expiresAt: number }>("/api/share-links", payload),

  list: () => api.get<{ links: ShareLinkInfo[] }>("/api/share-links"),

  delete: (id: string) => api.delete<{ ok: true }>(`/api/share-links/${id}`),

  getPublic: (token: string) =>
    api.get<PublicShareData>(`/api/share-links/${token}`),
};
```

- [ ] **Step 2: Commit**

```bash
git add client/src/api/shareLinks.ts
git commit -m "feat(share-links): add client API module"
```

---

## Task 8: Client Hooks — `client/src/hooks/useShareLinks.ts`

**Files:**
- Create: `client/src/hooks/useShareLinks.ts`

- [ ] **Step 1: Hooks erstellen**

Erstelle `client/src/hooks/useShareLinks.ts`:

```typescript
import { useMutation } from "@tanstack/react-query";
import { shareLinksApi } from "@/api/shareLinks";

export function useCreateShareLink() {
  return useMutation({
    mutationFn: (payload: { personName: string; personEmail: string }) =>
      shareLinksApi.create(payload),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/useShareLinks.ts
git commit -m "feat(share-links): add client hook"
```

---

## Task 9: Dialog-Komponente — `ShareLinkDialog.tsx`

**Files:**
- Create: `client/src/components/split-requests/ShareLinkDialog.tsx`

- [ ] **Step 1: Dialog erstellen**

Erstelle `client/src/components/split-requests/ShareLinkDialog.tsx`:

```typescript
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { useCreateShareLink } from "@/hooks/useShareLinks";
import { Copy, Check, Mail } from "lucide-react";

type Props = {
  personName: string;
  prefillEmail?: string;
  open: boolean;
  onClose: () => void;
};

export function ShareLinkDialog({ personName, prefillEmail, open, onClose }: Props) {
  const [email, setEmail] = useState(prefillEmail ?? "");
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const { toast } = useToast();
  const createLink = useCreateShareLink();

  function handleClose() {
    setEmail(prefillEmail ?? "");
    setCopied(false);
    setShareUrl(null);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = await createLink.mutateAsync({ personName, personEmail: email });
      setShareUrl(result.shareUrl);
    } catch {
      toast({ title: "Fehler beim Erstellen des Links", variant: "destructive" });
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link teilen — {personName}</DialogTitle>
          <DialogDescription>
            Der Link zeigt alle Anforderungen für diese Person. Er ist 20 Tage gültig.
          </DialogDescription>
        </DialogHeader>

        {!shareUrl ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="share-email">E-Mail-Adresse</Label>
              <Input
                id="share-email"
                type="email"
                placeholder="person@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus={!prefillEmail}
                readOnly={!!prefillEmail}
                className={prefillEmail ? "bg-muted/50" : ""}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose}>Abbrechen</Button>
              <Button type="submit" disabled={createLink.isPending}>
                <Mail className="h-4 w-4 mr-1.5" />
                {createLink.isPending ? "Wird gesendet..." : "Link senden"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-4 mt-2">
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
              Link wurde per E-Mail an <strong>{email}</strong> verschickt.
            </p>
            <div className="flex gap-2">
              <Input value={shareUrl} readOnly className="text-xs bg-muted/50 font-mono" />
              <Button variant="outline" size="icon" onClick={handleCopy} title="Kopieren">
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleClose}>Schließen</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/split-requests/ShareLinkDialog.tsx
git commit -m "feat(share-links): add ShareLinkDialog component"
```

---

## Task 10: MyAufteilungenList — Share-Button pro Person

**Files:**
- Modify: `client/src/components/split-requests/MyAufteilungenList.tsx`

- [ ] **Step 1: Personen-Share-Sektion hinzufügen**

Füge am Anfang von `client/src/components/split-requests/MyAufteilungenList.tsx` die neuen Imports hinzu:

```typescript
import { Share2 } from "lucide-react";
import { ShareLinkDialog } from "@/components/split-requests/ShareLinkDialog";
```

Füge in der `MyAufteilungenList`-Funktion (nach den bestehenden `useState`-Zeilen) hinzu:

```typescript
  const [shareTarget, setShareTarget] = useState<{ name: string; email?: string } | null>(null);
```

Füge nach dem `groups`-Memo ein neues Memo für unique Persons hinzu:

```typescript
  const persons = useMemo(() => {
    const map = new Map<string, { name: string; email?: string }>();
    for (const r of data?.requests ?? []) {
      const key = r.toUser?.email ?? r.freeName ?? "";
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          name: r.toUser?.name ?? r.freeName ?? "",
          email: r.toUser?.email,
        });
      }
    }
    return [...map.values()];
  }, [data]);
```

Füge direkt vor dem `<div className="flex flex-col gap-4">` (dem Haupt-Return) die Personen-Share-Sektion hinzu:

```typescript
      {persons.length > 0 && (
        <div className="mb-4 p-3 rounded-xl border border-border bg-muted/10">
          <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">Anforderungen teilen</p>
          <div className="flex flex-col gap-1.5">
            {persons.map((p) => (
              <div key={p.email ?? p.name} className="flex items-center justify-between gap-2">
                <span className="text-sm">{p.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setShareTarget(p)}
                >
                  <Share2 className="h-3.5 w-3.5" />
                  Link teilen
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
```

Füge am Ende des Returns (vor dem `<SplitBankTxDialog .../>`) hinzu:

```typescript
      <ShareLinkDialog
        open={shareTarget !== null}
        personName={shareTarget?.name ?? ""}
        prefillEmail={shareTarget?.email}
        onClose={() => setShareTarget(null)}
      />
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/split-requests/MyAufteilungenList.tsx
git commit -m "feat(share-links): add per-person share button to MyAufteilungenList"
```

---

## Task 11: Öffentliche Share-Seite — `client/src/pages/SharePage.tsx`

**Files:**
- Create: `client/src/pages/SharePage.tsx`

- [ ] **Step 1: SharePage erstellen**

Erstelle `client/src/pages/SharePage.tsx`:

```typescript
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { shareLinksApi } from "@/api/shareLinks";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import { ExternalLink, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const STATUS_LABELS: Record<string, string> = {
  pending:   "Ausstehend",
  unterwegs: "Unterwegs",
  accepted:  "Angenommen",
  rejected:  "Abgelehnt",
  cancelled: "Zurückgezogen",
};

const STATUS_CLS: Record<string, string> = {
  pending:   "bg-amber-100 text-amber-700",
  unterwegs: "bg-blue-100 text-blue-700",
  accepted:  "bg-green-100 text-green-700",
  rejected:  "bg-red-100 text-red-700",
  cancelled: "bg-zinc-100 text-zinc-600",
};

export function SharePage() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, error, isError } = useQuery({
    queryKey: ["share", token],
    queryFn: () => shareLinksApi.getPublic(token!),
    retry: false,
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Wird geladen…</p>
      </div>
    );
  }

  if (isError) {
    const msg = (error as Error).message ?? "";
    const isExpired = msg.includes("410");
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-sm w-full text-center flex flex-col items-center gap-3">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <p className="font-semibold text-foreground">
            {isExpired ? "Dieser Link ist abgelaufen" : "Dieser Link ist nicht mehr gültig"}
          </p>
          <p className="text-sm text-muted-foreground">
            Bitte den Absender bitten, einen neuen Link zu erstellen.
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const expiryDate = new Date(data.expiresAt).toLocaleDateString("de-DE", {
    day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground">
            Anforderungen für {data.personName}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Gültig bis {expiryDate}</p>
        </div>

        {data.requests.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Keine Anforderungen vorhanden.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {data.requests.map((r, i) => {
              const statusLabel = STATUS_LABELS[r.status] ?? r.status;
              const statusCls = STATUS_CLS[r.status] ?? "bg-zinc-100 text-zinc-600";
              return (
                <div key={i} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm text-foreground">{r.haendler}</p>
                      <p className="text-xs text-muted-foreground">{formatDateIso(r.datum)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="font-bold text-sm text-foreground">
                        {formatCurrency(r.betrag, r.waehrung)}
                      </span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusCls}`}>
                        {statusLabel}
                      </span>
                    </div>
                  </div>

                  {r.nachricht && (
                    <p className="text-xs text-muted-foreground border-t border-border/50 pt-2">
                      {r.nachricht}
                    </p>
                  )}

                  {r.driveFileUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-8 text-xs mt-1 gap-1.5"
                      onClick={() => window.open(r.driveFileUrl!, "_blank", "noopener,noreferrer")}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Beleg öffnen
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/SharePage.tsx
git commit -m "feat(share-links): add public SharePage"
```

---

## Task 12: App.tsx — Öffentliche Route hinzufügen

**Files:**
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Import und Route hinzufügen**

Füge in `client/src/App.tsx` den Import hinzu (nach den anderen Page-Imports):

```typescript
import { SharePage } from "@/pages/SharePage";
```

Füge direkt vor `<Route path="/login" ...>` (also außerhalb der `ProtectedRoute`) hinzu:

```typescript
            <Route path="/share/:token" element={<SharePage />} />
```

- [ ] **Step 2: TypeScript-Kompilierung prüfen**

```bash
cd client && npx tsc --noEmit
```

Erwartet: keine Fehler

- [ ] **Step 3: Alle Server-Tests ausführen**

```bash
cd server && npx vitest run
```

Erwartet: alle Tests bestehen

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat(share-links): add public /share/:token route to App"
```

---

## Task 13: Context & Progress-Tracker aktualisieren

**Files:**
- Modify: `context/progress-tracker.md`

- [ ] **Step 1: Progress-Tracker aktualisieren**

Öffne `context/progress-tracker.md` und füge unter „Completed Work" hinzu:

```
- Share-Links für Anforderungen: öffentliche /share/:token-Seite, Drive-Freigabe per E-Mail,
  Gmail-Versand über Owner-Account, 20-Tage-Ablauf, timing-safe Token-Lookup.
```

- [ ] **Step 2: Commit**

```bash
git add context/progress-tracker.md
git commit -m "docs(progress): record share-links feature as completed"
```

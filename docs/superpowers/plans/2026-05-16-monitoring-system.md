# Monitoring System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/monitoring` page that shows the live system health of all four ingestion services (Drive Inbox Poller, Gmail Poller, Telegram Bot, Gemini AI Extraction).

**Architecture:** Each service writes a health entry into a new SQLite `service_health` table after every run/call (upsert by service name). A new `GET /api/monitoring/health` endpoint (auth-protected) reads and returns all entries. The React page polls this endpoint every 30 seconds via TanStack Query and renders one status card per service.

**Tech Stack:** better-sqlite3, Express Router, Zod, TanStack Query, Lucide React, Tailwind CSS, Radix UI (existing patterns throughout).

---

## File Map

| Action | File |
|--------|------|
| Modify | `server/src/db/migrations.ts` |
| Create | `server/src/monitoring/repo.ts` |
| Create | `server/src/monitoring/routes.ts` |
| Modify | `server/src/inbox/poller.ts` |
| Modify | `server/src/gmail/poller.ts` |
| Modify | `server/src/telegram/bot.ts` |
| Modify | `server/src/gemini/extract.ts` |
| Modify | `server/src/app.ts` |
| Modify | `server/src/server.ts` |
| Create | `client/src/api/monitoring.ts` |
| Create | `client/src/hooks/useMonitoring.ts` |
| Create | `client/src/pages/Monitoring.tsx` |
| Modify | `client/src/App.tsx` |
| Modify | `client/src/components/AppShell.tsx` |

---

## Task 1: DB Migration — `service_health` Table

**Files:**
- Modify: `server/src/db/migrations.ts`

- [ ] **Step 1: Add the table creation to `runMigrations`**

Add this block at the end of `runMigrations`, after the existing `split_requests` block:

```ts
db.exec(`
  CREATE TABLE IF NOT EXISTS service_health (
    service_name    TEXT PRIMARY KEY,
    last_run_at     INTEGER NOT NULL,
    status          TEXT NOT NULL DEFAULT 'unknown'
                      CHECK (status IN ('ok', 'error', 'unknown')),
    items_processed INTEGER NOT NULL DEFAULT 0,
    items_failed    INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    updated_at      INTEGER NOT NULL
  )
`);
```

- [ ] **Step 2: Verify migration runs without error**

```bash
cd C:/Development/beleg-manager
npm run build --workspace=server 2>&1 | tail -5
```

Expected: build succeeds (exit 0), no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/db/migrations.ts
git commit -m "feat: add service_health table migration"
```

---

## Task 2: Health Repository

**Files:**
- Create: `server/src/monitoring/repo.ts`

- [ ] **Step 1: Create the repo**

```ts
import type { Db } from "../db/index.js";

export type ServiceStatus = "ok" | "error" | "unknown";

export type HealthEntry = {
  serviceName: string;
  lastRunAt: number;
  status: ServiceStatus;
  itemsProcessed: number;
  itemsFailed: number;
  lastError: string | null;
  updatedAt: number;
};

export type HealthRepo = {
  upsert(entry: Omit<HealthEntry, "updatedAt">): void;
  listAll(): HealthEntry[];
};

export function createHealthRepo(db: Db): HealthRepo {
  const upsertStmt = db.prepare<[string, number, string, number, number, string | null, number]>(`
    INSERT INTO service_health
      (service_name, last_run_at, status, items_processed, items_failed, last_error, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(service_name) DO UPDATE SET
      last_run_at     = excluded.last_run_at,
      status          = excluded.status,
      items_processed = excluded.items_processed,
      items_failed    = excluded.items_failed,
      last_error      = excluded.last_error,
      updated_at      = excluded.updated_at
  `);

  const listAllStmt = db.prepare<[], {
    service_name: string;
    last_run_at: number;
    status: string;
    items_processed: number;
    items_failed: number;
    last_error: string | null;
    updated_at: number;
  }>(`SELECT * FROM service_health`);

  return {
    upsert(entry) {
      const now = Date.now();
      upsertStmt.run(
        entry.serviceName,
        entry.lastRunAt,
        entry.status,
        entry.itemsProcessed,
        entry.itemsFailed,
        entry.lastError ?? null,
        now,
      );
    },
    listAll() {
      return listAllStmt.all().map((row) => ({
        serviceName: row.service_name,
        lastRunAt: row.last_run_at,
        status: row.status as ServiceStatus,
        itemsProcessed: row.items_processed,
        itemsFailed: row.items_failed,
        lastError: row.last_error,
        updatedAt: row.updated_at,
      }));
    },
  };
}
```

- [ ] **Step 2: Build to confirm no type errors**

```bash
npm run build --workspace=server 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add server/src/monitoring/repo.ts
git commit -m "feat: add monitoring health repository"
```

---

## Task 3: Monitoring API Route

**Files:**
- Create: `server/src/monitoring/routes.ts`

- [ ] **Step 1: Create the router**

```ts
import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import type { HealthRepo } from "./repo.js";

export function buildMonitoringRouter(healthRepo: HealthRepo) {
  const router = Router();
  router.use(requireAuth);

  router.get("/health", (_req, res) => {
    res.json({ services: healthRepo.listAll() });
  });

  return router;
}
```

- [ ] **Step 2: Build**

```bash
npm run build --workspace=server 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add server/src/monitoring/routes.ts
git commit -m "feat: add monitoring health API route"
```

---

## Task 4: Instrument Drive Inbox Poller

**Files:**
- Modify: `server/src/inbox/poller.ts`

- [ ] **Step 1: Add `healthRepo` to `PollerDeps` and write health after each run**

Change the `PollerDeps` type to include the optional repo:

```ts
import type { HealthRepo } from "../monitoring/repo.js";

export type PollerDeps = {
  config: Config;
  userRepo: UserRepo;
  gemini: GeminiClient;
  healthRepo?: HealthRepo;
};
```

At the end of `startInboxPoller`, wrap the cron callback to write health after `runOnce` resolves:

```ts
const task = cron.schedule("*/5 * * * *", () => {
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
```

- [ ] **Step 2: Build**

```bash
npm run build --workspace=server 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add server/src/inbox/poller.ts
git commit -m "feat: instrument drive inbox poller with health reporting"
```

---

## Task 5: Instrument Gmail Poller

**Files:**
- Modify: `server/src/gmail/poller.ts`

- [ ] **Step 1: Add `healthRepo` to `GmailPollerDeps` and write health after each run**

```ts
import type { HealthRepo } from "../monitoring/repo.js";

export type GmailPollerDeps = {
  config: Config;
  userRepo: UserRepo;
  db: Db;
  healthRepo?: HealthRepo;
};
```

In `startGmailPoller`, replace the cron callback:

```ts
const task = cron.schedule("*/5 * * * *", () => {
  runOnce(deps, checkProcessed, markProcessed)
    .then(({ processed, failed }) => {
      deps.healthRepo?.upsert({
        serviceName: "gmail-poller",
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
        serviceName: "gmail-poller",
        lastRunAt: Date.now(),
        status: "error",
        itemsProcessed: 0,
        itemsFailed: 0,
        lastError: String((err as Error).message ?? err).slice(0, 500),
      });
    });
});
```

- [ ] **Step 2: Build**

```bash
npm run build --workspace=server 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add server/src/gmail/poller.ts
git commit -m "feat: instrument gmail poller with health reporting"
```

---

## Task 6: Instrument Telegram Bot

**Files:**
- Modify: `server/src/telegram/bot.ts`

- [ ] **Step 1: Add `healthRepo` to `TelegramBotDeps` and track per-webhook success/fail**

```ts
import type { HealthRepo } from "../monitoring/repo.js";

export type TelegramBotDeps = {
  config: Config;
  userRepo: UserRepo;
  gemini: GeminiClient;
  healthRepo?: HealthRepo;
};
```

At the end of the `try` block inside the webhook handler (after the `sendMessage` success confirmation), add:

```ts
deps.healthRepo?.upsert({
  serviceName: "telegram-bot",
  lastRunAt: Date.now(),
  status: "ok",
  itemsProcessed: 1,
  itemsFailed: 0,
  lastError: null,
});
```

At the end of the `catch` block inside the webhook handler (after logging the error), add:

```ts
deps.healthRepo?.upsert({
  serviceName: "telegram-bot",
  lastRunAt: Date.now(),
  status: "error",
  itemsProcessed: 0,
  itemsFailed: 1,
  lastError: String((err as Error).message ?? err).slice(0, 500),
});
```

Also remove the two `console.error` calls inside `bot.ts` and replace them with `logger` (import `logger` from `"../logger.js"` and use `log.error`), since `console.error` violates code standards.

Add at the top of the file:
```ts
import { logger } from "../logger.js";
const log = logger.child({ module: "telegram-bot" });
```

Replace `console.error("[telegram-bot] archive failed:", archErr)` with:
```ts
log.warn({ err: archErr }, "archive failed, continuing without link");
```

Replace `console.error("[telegram-bot]", err)` with:
```ts
log.error({ err }, "webhook processing failed");
```

- [ ] **Step 2: Build**

```bash
npm run build --workspace=server 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add server/src/telegram/bot.ts
git commit -m "feat: instrument telegram bot with health reporting, replace console.error with logger"
```

---

## Task 7: Instrument Gemini Extraction

**Files:**
- Modify: `server/src/gemini/extract.ts`

- [ ] **Step 1: Read the current extract.ts to understand the GeminiClient interface**

Read `server/src/gemini/extract.ts` before editing.

- [ ] **Step 2: Add optional `healthRepo` to `createGeminiClient` and track each extraction**

Add the import at the top:
```ts
import type { HealthRepo } from "../monitoring/repo.js";
```

Change `createGeminiClient` signature to accept an optional `healthRepo`:
```ts
export function createGeminiClient(apiKey: string, healthRepo?: HealthRepo): GeminiClient {
```

Inside the `extractFromPhoto` implementation, wrap the existing call:

```ts
// after the existing extraction call succeeds:
healthRepo?.upsert({
  serviceName: "gemini-extraction",
  lastRunAt: Date.now(),
  status: "ok",
  itemsProcessed: 1,
  itemsFailed: 0,
  lastError: null,
});
```

In the catch block (or wherever extraction errors are handled), add:
```ts
healthRepo?.upsert({
  serviceName: "gemini-extraction",
  lastRunAt: Date.now(),
  status: "error",
  itemsProcessed: 0,
  itemsFailed: 1,
  lastError: String((err as Error).message ?? err).slice(0, 500),
});
```

- [ ] **Step 3: Build**

```bash
npm run build --workspace=server 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add server/src/gemini/extract.ts
git commit -m "feat: instrument gemini client with health reporting"
```

---

## Task 8: Wire Everything Together in `app.ts` and `server.ts`

**Files:**
- Modify: `server/src/app.ts`
- Modify: `server/src/server.ts`

- [ ] **Step 1: Update `AppDeps` in `app.ts` to include `healthRepo` and mount the monitoring router**

Add import:
```ts
import type { HealthRepo } from "./monitoring/repo.js";
import { buildMonitoringRouter } from "./monitoring/routes.js";
```

Add `healthRepo` to `AppDeps`:
```ts
export type AppDeps = {
  config: Config;
  db: Db;
  gemini: GeminiClient;
  pending: PendingStore;
  healthRepo: HealthRepo;
  onFirstLogin?: (userId: string) => Promise<void>;
};
```

Pass `healthRepo` to the Telegram router (update the call):
```ts
app.use("/api/telegram", buildTelegramRouter({
  config: deps.config,
  userRepo,
  gemini: deps.gemini,
  healthRepo: deps.healthRepo,
}));
```

Mount the monitoring router after the existing routes:
```ts
app.use("/api/monitoring", buildMonitoringRouter(deps.healthRepo));
```

- [ ] **Step 2: Update `server.ts` to create `healthRepo` and pass it everywhere**

Add import:
```ts
import { createHealthRepo } from "./monitoring/repo.js";
```

After `runMigrations(db)`:
```ts
const healthRepo = createHealthRepo(db);
```

Pass `healthRepo` to `createGeminiClient`:
```ts
const gemini = createGeminiClient(config.geminiApiKey, healthRepo);
```

Pass `healthRepo` to `createApp`:
```ts
const app = createApp({ config, db, gemini, pending, healthRepo, onFirstLogin });
```

Pass `healthRepo` to `startInboxPoller`:
```ts
const poller = startInboxPoller({ config, userRepo, gemini, healthRepo });
```

Pass `healthRepo` to `startGmailPoller`:
```ts
const gmailPoller = startGmailPoller({ config, userRepo, db, healthRepo });
```

- [ ] **Step 3: Build**

```bash
npm run build --workspace=server 2>&1 | tail -5
```

Expected: build succeeds, all types check.

- [ ] **Step 4: Commit**

```bash
git add server/src/app.ts server/src/server.ts
git commit -m "feat: wire monitoring health repo into all services and mount API route"
```

---

## Task 9: Frontend API Client + Hook

**Files:**
- Create: `client/src/api/monitoring.ts`
- Create: `client/src/hooks/useMonitoring.ts`

- [ ] **Step 1: Create `client/src/api/monitoring.ts`**

```ts
import { apiClient } from "./client";

export type ServiceStatus = "ok" | "error" | "unknown";

export type HealthEntry = {
  serviceName: string;
  lastRunAt: number;
  status: ServiceStatus;
  itemsProcessed: number;
  itemsFailed: number;
  lastError: string | null;
  updatedAt: number;
};

export type MonitoringHealth = {
  services: HealthEntry[];
};

export const monitoringApi = {
  getHealth: () => apiClient.get<MonitoringHealth>("/api/monitoring/health"),
};
```

- [ ] **Step 2: Create `client/src/hooks/useMonitoring.ts`**

```ts
import { useQuery } from "@tanstack/react-query";
import { monitoringApi } from "@/api/monitoring";

export function useMonitoringHealth() {
  return useQuery({
    queryKey: ["monitoring-health"],
    queryFn: () => monitoringApi.getHealth(),
    refetchInterval: 30_000,
  });
}
```

- [ ] **Step 3: Build client to confirm no type errors**

```bash
npm run build --workspace=client 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add client/src/api/monitoring.ts client/src/hooks/useMonitoring.ts
git commit -m "feat: add monitoring API client and useMonitoringHealth hook"
```

---

## Task 10: Monitoring Page

**Files:**
- Create: `client/src/pages/Monitoring.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { useMonitoringHealth } from "@/hooks/useMonitoring";
import type { HealthEntry, ServiceStatus } from "@/api/monitoring";
import { CheckCircle, XCircle, HelpCircle, RefreshCw } from "lucide-react";

const SERVICE_LABELS: Record<string, string> = {
  "drive-inbox-poller": "Drive Inbox Poller",
  "gmail-poller":       "Gmail Poller",
  "telegram-bot":       "Telegram Bot",
  "gemini-extraction":  "Gemini AI Extraction",
};

const ALL_SERVICES = Object.keys(SERVICE_LABELS);

function StatusIcon({ status }: { status: ServiceStatus }) {
  if (status === "ok")      return <CheckCircle  className="w-5 h-5 text-green-500" />;
  if (status === "error")   return <XCircle      className="w-5 h-5 text-red-500"   />;
  return                           <HelpCircle   className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />;
}

function statusBadge(status: ServiceStatus) {
  const base = "text-[10px] font-black uppercase tracking-[0.15em] px-2 py-0.5 rounded-full";
  if (status === "ok")    return `${base} bg-green-500/10 text-green-500`;
  if (status === "error") return `${base} bg-red-500/10 text-red-500`;
  return                         `${base} bg-[hsl(var(--muted-foreground))]/10 text-[hsl(var(--muted-foreground))]`;
}

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1)  return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `vor ${diffH} Std.`;
  return `vor ${Math.floor(diffH / 24)} Tagen`;
}

function ServiceCard({ entry }: { entry: HealthEntry }) {
  const label = SERVICE_LABELS[entry.serviceName] ?? entry.serviceName;
  return (
    <div className="bg-[var(--surface)] border border-[hsl(var(--border))] rounded-2xl p-6 shadow-[var(--card-shadow)] clay-card-static flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">{label}</h3>
        <span className={statusBadge(entry.status)}>
          {entry.status === "ok" ? "OK" : entry.status === "error" ? "Fehler" : "Unbekannt"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <StatusIcon status={entry.status} />
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          Letzter Lauf: {relativeTime(entry.lastRunAt)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-black text-[hsl(var(--muted-foreground))] uppercase tracking-[0.15em]">Verarbeitet</span>
          <span className="text-xl font-black text-[hsl(var(--foreground))]">{entry.itemsProcessed}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-black text-[hsl(var(--muted-foreground))] uppercase tracking-[0.15em]">Fehler</span>
          <span className={`text-xl font-black ${entry.itemsFailed > 0 ? "text-red-500" : "text-[hsl(var(--foreground))]"}`}>
            {entry.itemsFailed}
          </span>
        </div>
      </div>

      {entry.lastError && (
        <p className="text-[11px] text-red-500 bg-red-500/5 rounded-lg px-3 py-2 font-mono break-all">
          {entry.lastError}
        </p>
      )}
    </div>
  );
}

function UnknownCard({ serviceName }: { serviceName: string }) {
  const label = SERVICE_LABELS[serviceName] ?? serviceName;
  const phantom: HealthEntry = {
    serviceName,
    lastRunAt: 0,
    status: "unknown",
    itemsProcessed: 0,
    itemsFailed: 0,
    lastError: null,
    updatedAt: 0,
  };
  return <ServiceCard entry={phantom} />;
}

export function MonitoringPage() {
  const { data, isLoading, refetch, isFetching } = useMonitoringHealth();

  const byName = Object.fromEntries((data?.services ?? []).map((s) => [s.serviceName, s]));

  return (
    <div className="h-full w-full flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Automatische Aktualisierung alle 30 Sekunden
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 h-9 px-4 rounded-lg border border-[hsl(var(--border))] text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[var(--hover-bg)] transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          Aktualisieren
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          {ALL_SERVICES.map((name) => (
            <div key={name} className="bg-[var(--surface)] border border-[hsl(var(--border))] rounded-2xl p-6 h-44 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          {ALL_SERVICES.map((name) =>
            byName[name]
              ? <ServiceCard key={name} entry={byName[name]} />
              : <UnknownCard key={name} serviceName={name} />
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build client**

```bash
npm run build --workspace=client 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Monitoring.tsx
git commit -m "feat: add monitoring page with service health cards"
```

---

## Task 11: Register Route and Nav Item

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/AppShell.tsx`

- [ ] **Step 1: Add route to `App.tsx`**

Add import:
```ts
import { MonitoringPage } from "@/pages/Monitoring";
```

Add route inside the protected `<Route>` group (after the `/settings` route):
```tsx
<Route path="/monitoring" element={<MonitoringPage />} />
```

- [ ] **Step 2: Add nav item and page title to `AppShell.tsx`**

Add `Activity` to the lucide-react import:
```ts
import { ..., Activity } from "lucide-react";
```

Add to `navItems` array (after `/settings`):
```ts
{ to: "/monitoring", label: "Monitoring", icon: Activity },
```

Add to `PAGE_TITLES`:
```ts
"/monitoring": "Monitoring",
```

- [ ] **Step 3: Build both workspaces**

```bash
npm run build --workspace=client 2>&1 | tail -10
npm run build --workspace=server 2>&1 | tail -5
```

Expected: both build successfully.

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx client/src/components/AppShell.tsx
git commit -m "feat: add monitoring route and sidebar nav item"
```

---

## Task 12: Update Progress Tracker

**Files:**
- Modify: `context/progress-tracker.md`

- [ ] **Step 1: Update tracker**

Move "Monitoring system for further UI improvements" from Next Up to Completed and add a brief architecture note:

```markdown
## Completed

- ...previous entries...
- Implemented system health monitoring page at /monitoring with service cards for Drive Inbox Poller, Gmail Poller, Telegram Bot, and Gemini AI Extraction.

## Architecture Decisions

- ...previous entries...
- `service_health` SQLite table tracks last-run status per service (upsert by service_name). Each service writes health after every run/call. Frontend polls GET /api/monitoring/health every 30s.
```

- [ ] **Step 2: Commit**

```bash
git add context/progress-tracker.md
git commit -m "docs: update progress tracker after monitoring system implementation"
```

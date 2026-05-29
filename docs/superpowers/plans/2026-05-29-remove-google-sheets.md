# Google Sheets Ausbau — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle verbliebenen Reste der Google-Sheets-Integration vollständig aus dem Codebase entfernen, nachdem die Kernfunktionalität bereits zu SQLite migriert wurde.

**Architecture:** `sheets.ts` und `sheets.test.ts` wurden bereits in commit b62f5b3 gelöscht und alle Routen auf SQLite migriert. Was verbleibt, sind verwaiste Typ-Felder (`sheetId`), SQL-Spalten (`sheet_id`), ein ungenutzter OAuth-Scope (`spreadsheets`) und ein kaputter Test-Import. Diese drei unabhängigen Schichten werden sequenziell bereinigt.

**Tech Stack:** TypeScript, better-sqlite3, Vitest, Passport.js (Google OAuth), google-auth-library

---

## File Map

| Datei | Änderung |
|---|---|
| `server/test/stats-compute.test.ts` | Kaputten Import + fehlende `trinkgeld`-Eigenschaft fixen |
| `server/src/auth/userRepo.ts` | `sheetId` aus `UserRow`-Typ, `DriveAssets`-Typ und allen SQL-Statements entfernen |
| `server/src/google/bootstrap.ts` | `sheetId`-Übergabe aus `setDriveAssets`-Aufruf entfernen |
| `server/test/userRepo.test.ts` | `sheetId`-Assertion im Test entfernen |
| `server/src/db/migrations.ts` | `sheet_id TEXT` aus `SCHEMA`-Definition entfernen |
| `server/test/db.test.ts` | `"sheet_id"` aus erwartetem Spalten-Array entfernen |
| `server/src/auth/passport.ts` | OAuth-Scope `spreadsheets` entfernen |

---

## Task 1: Kaputten Test-Import in stats-compute.test.ts reparieren

`stats-compute.test.ts:3` importiert `ReceiptRow` aus `"../google/sheets.js"` — diese Datei wurde gelöscht. Der richtige Typ liegt in `receiptRepo.ts`. Außerdem fehlt `trinkgeld` in der Factory-Funktion des Tests, obwohl `ReceiptRow` es als Pflichtfeld hat.

**Files:**
- Modify: `server/test/stats-compute.test.ts`

- [ ] **Step 1: Test laufen lassen und den Fehler bestätigen**

```bash
cd server && npx vitest run test/stats-compute.test.ts
```

Erwartetes Ergebnis: Fehler wie `Cannot find module '../src/google/sheets.js'`

- [ ] **Step 2: Import und Factory-Funktion fixen**

Datei `server/test/stats-compute.test.ts` vollständig ersetzen:

```typescript
import { describe, it, expect } from "vitest";
import { computeSummary, computeMonthly, computeCategories } from "../src/stats/compute.js";
import type { ReceiptRow } from "../src/receipts/receiptRepo.js";

const r = (datum: string, betrag: number, kategorie = "Restaurant"): ReceiptRow => ({
  id: "x", datum, haendler: "h", betrag, mwst: 0, trinkgeld: 0, waehrung: "EUR",
  kategorie, zahlungsmethode: "Karte", rechnungsnummer: "",
  driveLink: "", eingabeTyp: "foto", erstelltAm: "",
});

describe("computeSummary", () => {
  it("aggregates correctly", () => {
    const today = new Date(Date.UTC(2026, 4, 15)); // May 2026
    const rows = [r("2026-05-01", 10), r("2026-05-15", 20), r("2026-04-30", 5), r("2025-12-01", 99)];
    const s = computeSummary(rows, today);
    expect(s.monthTotal).toBe(30);
    expect(s.yearTotal).toBe(35);
    expect(s.count).toBe(4);
  });

  it("identifies top category", () => {
    const today = new Date(Date.UTC(2026, 4, 15));
    const s = computeSummary([r("2026-05-01", 10, "A"), r("2026-05-02", 50, "B"), r("2026-05-03", 5, "B")], today);
    expect(s.topCategory).toBe("B");
  });
});

describe("computeMonthly", () => {
  it("returns 12 buckets ending at the current month", () => {
    const today = new Date(Date.UTC(2026, 4, 15));
    const out = computeMonthly([r("2026-05-01", 10), r("2026-04-15", 20)], 12, today);
    expect(out).toHaveLength(12);
    expect(out[out.length - 1]).toEqual({ ym: "2026-05", total: 10 });
    expect(out[out.length - 2]).toEqual({ ym: "2026-04", total: 20 });
  });
});

describe("computeCategories", () => {
  it("sorts descending by total", () => {
    const out = computeCategories([r("2026-05-01", 10, "A"), r("2026-05-02", 50, "B"), r("2026-05-03", 5, "C")]);
    expect(out.map((x) => x.kategorie)).toEqual(["B", "A", "C"]);
  });
});
```

- [ ] **Step 3: Test erneut laufen lassen**

```bash
cd server && npx vitest run test/stats-compute.test.ts
```

Erwartetes Ergebnis: `4 tests passed`

- [ ] **Step 4: Commit**

```bash
git add server/test/stats-compute.test.ts
git commit -m "fix(tests): repair broken ReceiptRow import in stats-compute.test.ts"
```

---

## Task 2: `sheetId` aus der Datenschicht entfernen

`sheetId` existiert in zwei TypeScript-Typen (`UserRow`, `DriveAssets`), in allen SQL-Queries von `userRepo.ts` und im `setDriveAssets`-Aufruf in `bootstrap.ts`. Diese müssen zusammen geändert werden, da TypeScript sonst beim Bauen Fehler wirft.

**Files:**
- Modify: `server/src/auth/userRepo.ts`
- Modify: `server/src/google/bootstrap.ts`
- Modify: `server/test/userRepo.test.ts`

- [ ] **Step 1: Tests zuerst anpassen — `sheetId`-Assertion aus `userRepo.test.ts` entfernen**

Den Test `"preserves drive folder ids on upsert"` in `server/test/userRepo.test.ts` anpassen:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { openDatabase } from "../src/db/index.js";
import { runMigrations } from "../src/db/migrations.js";
import { createUserRepo } from "../src/auth/userRepo.js";

describe("userRepo", () => {
  let repo: ReturnType<typeof createUserRepo>;

  beforeEach(() => {
    const db = openDatabase(":memory:");
    runMigrations(db);
    repo = createUserRepo(db);
  });

  it("upserts a user and reads back", () => {
    repo.upsert({ id: "g1", email: "a@b.de", name: "Alice", refreshToken: "rt1" });
    const u = repo.getById("g1");
    expect(u).toMatchObject({ id: "g1", email: "a@b.de", name: "Alice", refreshToken: "rt1" });
  });

  it("preserves drive folder ids on upsert", () => {
    repo.upsert({ id: "g1", email: "a@b.de", name: "Alice", refreshToken: "rt1" });
    repo.setDriveAssets("g1", {
      driveRootFolderId: "root",
      driveInboxFolderId: "inbox",
      driveArchiveFolderId: "arch",
    });
    repo.upsert({ id: "g1", email: "a@b.de", name: "Alice 2", refreshToken: "rt2" });
    const u = repo.getById("g1");
    expect(u?.driveRootFolderId).toBe("root");
    expect(u?.name).toBe("Alice 2");
    expect(u?.refreshToken).toBe("rt2");
  });
});
```

- [ ] **Step 2: Test laufen lassen — erwartet TypeScript-Fehler wegen `sheetId` in `setDriveAssets`-Aufruf**

```bash
cd server && npx vitest run test/userRepo.test.ts
```

Erwartetes Ergebnis: TypeScript-Fehler `Object literal may only specify known properties [...] 'sheetId' does not exist` — sobald wir `userRepo.ts` angepasst haben.

- [ ] **Step 3: `sheetId` aus `userRepo.ts` entfernen**

`server/src/auth/userRepo.ts` vollständig ersetzen:

```typescript
import type { Db } from "../db/index.js";

export type UserRow = {
  id: string;
  email: string;
  name: string;
  driveRootFolderId: string | null;
  driveInboxFolderId: string | null;
  driveArchiveFolderId: string | null;
  refreshToken: string | null;
  createdAt: number;
  gmailPollingEnabled: boolean;
  gmailLabelFilter: string;
  telegramBotToken: string | null;
  receiptsViewMode: "table" | "list" | null;
  startPage: string;
  customCategories: string;
};

type UpsertInput = { id: string; email: string; name: string; refreshToken: string | null };

type DriveAssets = {
  driveRootFolderId: string;
  driveInboxFolderId: string;
  driveArchiveFolderId: string;
};

export function createUserRepo(db: Db) {
  return {
    upsert(input: UpsertInput): void {
      db.prepare(
        `INSERT INTO users (id, email, name, refresh_token, created_at)
         VALUES (@id, @email, @name, @refreshToken, @createdAt)
         ON CONFLICT(id) DO UPDATE SET
           email = excluded.email,
           name = excluded.name,
           refresh_token = COALESCE(excluded.refresh_token, users.refresh_token)`
      ).run({ ...input, createdAt: Date.now() });
    },

    getById(id: string): UserRow | undefined {
      const row = db
        .prepare(
          `SELECT id, email, name,
            drive_root_folder_id AS driveRootFolderId,
            drive_inbox_folder_id AS driveInboxFolderId,
            drive_archive_folder_id AS driveArchiveFolderId,
            refresh_token AS refreshToken,
            created_at AS createdAt,
            gmail_polling_enabled AS gmailPollingEnabled,
            gmail_label_filter AS gmailLabelFilter,
            telegram_bot_token AS telegramBotToken,
            receipts_view_mode AS receiptsViewMode,
            start_page AS startPage,
            COALESCE(custom_categories, '[]') AS customCategories
           FROM users WHERE id = ?`
        )
        .get(id) as (Omit<UserRow, "gmailPollingEnabled"> & { gmailPollingEnabled: number }) | undefined;
      if (!row) return undefined;
      return { ...row, gmailPollingEnabled: row.gmailPollingEnabled === 1 };
    },

    setDriveAssets(id: string, assets: DriveAssets): void {
      db.prepare(
        `UPDATE users SET
          drive_root_folder_id = @driveRootFolderId,
          drive_inbox_folder_id = @driveInboxFolderId,
          drive_archive_folder_id = @driveArchiveFolderId
         WHERE id = @id`
      ).run({ id, ...assets });
    },

    listAllWithRefreshToken(): UserRow[] {
      const rows = db
        .prepare(
          `SELECT id, email, name,
            drive_root_folder_id AS driveRootFolderId,
            drive_inbox_folder_id AS driveInboxFolderId,
            drive_archive_folder_id AS driveArchiveFolderId,
            refresh_token AS refreshToken,
            created_at AS createdAt,
            gmail_polling_enabled AS gmailPollingEnabled,
            gmail_label_filter AS gmailLabelFilter,
            telegram_bot_token AS telegramBotToken,
            receipts_view_mode AS receiptsViewMode,
            start_page AS startPage,
            COALESCE(custom_categories, '[]') AS customCategories
           FROM users WHERE refresh_token IS NOT NULL`
        )
        .all() as (Omit<UserRow, "gmailPollingEnabled"> & { gmailPollingEnabled: number })[];
      return rows.map((r) => ({ ...r, gmailPollingEnabled: r.gmailPollingEnabled === 1 }));
    },

    setGmailSettings(id: string, enabled: boolean, labelFilter: string): void {
      db.prepare(
        `UPDATE users SET gmail_polling_enabled = @enabled, gmail_label_filter = @labelFilter WHERE id = @id`
      ).run({ id, enabled: enabled ? 1 : 0, labelFilter });
    },

    setTelegramBotToken(id: string, token: string | null): void {
      db.prepare("UPDATE users SET telegram_bot_token = @token WHERE id = @id").run({ id, token });
    },

    setUISettings(id: string, settings: { receiptsViewMode?: "table" | "list"; startPage?: string }): void {
      if (settings.receiptsViewMode) {
        db.prepare("UPDATE users SET receipts_view_mode = @mode WHERE id = @id").run({ id, mode: settings.receiptsViewMode });
      }
      if (settings.startPage) {
        db.prepare("UPDATE users SET start_page = @page WHERE id = @id").run({ id, page: settings.startPage });
      }
    },

    setCustomCategories(id: string, categories: string[]): void {
      db.prepare("UPDATE users SET custom_categories = @cats WHERE id = @id").run({ id, cats: JSON.stringify(categories) });
    },

    clearDriveFolderIds(id: string): void {
      db.prepare(
        `UPDATE users SET drive_root_folder_id = NULL, drive_inbox_folder_id = NULL, drive_archive_folder_id = NULL WHERE id = ?`
      ).run(id);
    },

    deleteUser(id: string): void {
      db.prepare("DELETE FROM users WHERE id = ?").run(id);
    },
  };
}

export type UserRepo = ReturnType<typeof createUserRepo>;
```

- [ ] **Step 4: `sheetId` aus `bootstrap.ts` entfernen**

`server/src/google/bootstrap.ts` vollständig ersetzen:

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
  });
}
```

- [ ] **Step 5: Tests laufen lassen**

```bash
cd server && npx vitest run test/userRepo.test.ts
```

Erwartetes Ergebnis: `2 tests passed`

- [ ] **Step 6: Commit**

```bash
git add server/src/auth/userRepo.ts server/src/google/bootstrap.ts server/test/userRepo.test.ts
git commit -m "refactor: remove sheetId from UserRow, DriveAssets, and all SQL queries"
```

---

## Task 3: Schema-Definition und OAuth-Scope bereinigen

`sheet_id` noch in `SCHEMA` in `migrations.ts` (für Neuinstallationen) und `db.test.ts` (Spalten-Assertion). Der OAuth-Scope `spreadsheets` in `passport.ts` wird nirgends mehr benötigt.

**Hinweis zu bestehenden Datenbanken:** SQLite unterstützt kein `DROP COLUMN` in älteren Versionen. Da `sheet_id` nur `NULL`-Werte enthält und das Schema sowieso nur für Neuinstallationen gilt, reicht es, die Spalte aus `SCHEMA` zu entfernen. Bestehende DBs behalten die verwaiste Spalte harmlos.

**Files:**
- Modify: `server/src/db/migrations.ts`
- Modify: `server/test/db.test.ts`
- Modify: `server/src/auth/passport.ts`

- [ ] **Step 1: Test zuerst anpassen — `"sheet_id"` aus erwartetem Spalten-Array in `db.test.ts` entfernen**

In `server/test/db.test.ts` den ersten Test aktualisieren:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { openDatabase } from "../src/db/index.js";
import { runMigrations } from "../src/db/migrations.js";

describe("db migrations", () => {
  let db: ReturnType<typeof openDatabase>;

  beforeEach(() => {
    db = openDatabase(":memory:");
    runMigrations(db);
  });

  it("creates users table with required columns", () => {
    const cols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
    const names = cols.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "id",
        "email",
        "name",
        "drive_root_folder_id",
        "drive_inbox_folder_id",
        "drive_archive_folder_id",
        "created_at",
      ])
    );
  });

  it("creates failed_voice_jobs table", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    expect(tables.map((t) => t.name)).toContain("failed_voice_jobs");
  });

  it("upserts a user by id", () => {
    db.prepare(
      `INSERT INTO users (id, email, name, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET email=excluded.email, name=excluded.name`
    ).run("u1", "a@b.de", "Alice", Date.now());
    const row = db.prepare("SELECT id, email FROM users WHERE id = ?").get("u1");
    expect(row).toEqual({ id: "u1", email: "a@b.de" });
  });
});
```

- [ ] **Step 2: `sheet_id` aus `SCHEMA` in `migrations.ts` entfernen**

In `server/src/db/migrations.ts` die Zeile `sheet_id TEXT,` aus dem `CREATE TABLE IF NOT EXISTS users`-Block entfernen. Die `users`-Tabellen-Definition sieht danach so aus:

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  drive_root_folder_id TEXT,
  drive_inbox_folder_id TEXT,
  drive_archive_folder_id TEXT,
  refresh_token TEXT,
  created_at INTEGER NOT NULL
);
```

- [ ] **Step 3: `spreadsheets`-Scope aus `passport.ts` entfernen**

In `server/src/auth/passport.ts` die Zeile mit `spreadsheets` aus `GOOGLE_SCOPES` entfernen:

```typescript
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];
```

- [ ] **Step 4: Alle Tests laufen lassen**

```bash
cd server && npx vitest run
```

Erwartetes Ergebnis: Alle Tests grün, kein `sheet_id`- oder `spreadsheets`-Fehler.

- [ ] **Step 5: TypeScript-Build prüfen**

```bash
cd server && npx tsc --noEmit
```

Erwartetes Ergebnis: Keine Fehler.

- [ ] **Step 6: Commit**

```bash
git add server/src/db/migrations.ts server/test/db.test.ts server/src/auth/passport.ts
git commit -m "chore: remove sheet_id from schema and spreadsheets OAuth scope — Sheets fully removed"
```

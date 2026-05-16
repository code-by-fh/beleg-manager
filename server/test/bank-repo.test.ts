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
  // Insert stub users to satisfy the FK constraint on bank_transactions.user_id
  const insertUser = db.prepare(
    `INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)`
  );
  insertUser.run("user-1", "user1@test.com", "User One", Date.now());
  insertUser.run("user-2", "user2@test.com", "User Two", Date.now());
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

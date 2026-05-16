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
        "sheet_id",
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

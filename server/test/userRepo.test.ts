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

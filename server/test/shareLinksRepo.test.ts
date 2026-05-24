import { describe, it, expect, beforeEach } from "vitest";
import { openDatabase } from "../src/db/index.js";
import { runMigrations } from "../src/db/migrations.js";
import { createShareLinkRepo } from "../src/share-links/repo.js";

describe("shareLinkRepo", () => {
  let repo: ReturnType<typeof createShareLinkRepo>;
  let db: ReturnType<typeof openDatabase>;

  beforeEach(() => {
    db = openDatabase(":memory:");
    runMigrations(db);
    // Insert test users so FK constraint is satisfied
    db.prepare(
      `INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)`
    ).run("user1", "user1@test.de", "User One", Date.now());
    db.prepare(
      `INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)`
    ).run("u1", "u1@test.de", "U One", Date.now());
    db.prepare(
      `INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)`
    ).run("u2", "u2@test.de", "U Two", Date.now());
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

import { describe, it, expect, beforeEach } from "vitest";
import { openDatabase } from "../src/db/index.js";
import { runMigrations } from "../src/db/migrations.js";
import { createReceiptRepo } from "../src/receipts/receiptRepo.js";

function makeRepo() {
  const db = openDatabase(":memory:");
  runMigrations(db);
  db.prepare("INSERT INTO users (id, email, name, created_at) VALUES ('u1', 'a@b.com', 'A', 1)").run();
  return createReceiptRepo(db);
}

const baseRow = {
  id: "r1",
  datum: "2024-03-15",
  haendler: "Edeka",
  betrag: 42.5,
  mwst: 3.0,
  trinkgeld: 0,
  waehrung: "EUR",
  kategorie: "Lebensmittel",
  zahlungsmethode: "Karte",
  rechnungsnummer: "",
  driveLink: "",
  eingabeTyp: "foto" as const,
  erstelltAm: "2024-03-15T10:00:00.000Z",
};

describe("receiptRepo", () => {
  it("insert and findAll returns inserted row", () => {
    const repo = makeRepo();
    repo.insert("u1", baseRow);
    const rows = repo.findAll("u1");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("r1");
    expect(rows[0].haendler).toBe("Edeka");
    expect(rows[0].betrag).toBe(42.5);
  });

  it("findAll returns only rows for given user", () => {
    const repo = makeRepo();
    const db = (repo as any)._db; // won't be exposed, but the repo is scoped by userId
    repo.insert("u1", baseRow);
    const rows = repo.findAll("u2");
    expect(rows).toHaveLength(0);
  });

  it("findById returns the row for the right user", () => {
    const repo = makeRepo();
    repo.insert("u1", baseRow);
    expect(repo.findById("u1", "r1")).toBeDefined();
    expect(repo.findById("u2", "r1")).toBeUndefined();
  });

  it("update modifies existing row", () => {
    const repo = makeRepo();
    repo.insert("u1", baseRow);
    const ok = repo.update("u1", { ...baseRow, haendler: "Rewe", betrag: 10 });
    expect(ok).toBe(true);
    expect(repo.findById("u1", "r1")?.haendler).toBe("Rewe");
  });

  it("update returns false for unknown id", () => {
    const repo = makeRepo();
    expect(repo.update("u1", { ...baseRow, id: "nope" })).toBe(false);
  });

  it("delete removes the row", () => {
    const repo = makeRepo();
    repo.insert("u1", baseRow);
    expect(repo.delete("u1", "r1")).toBe(true);
    expect(repo.findAll("u1")).toHaveLength(0);
  });

  it("delete returns false for unknown id", () => {
    const repo = makeRepo();
    expect(repo.delete("u1", "nope")).toBe(false);
  });

  it("checkDuplicate detects same haendler+betrag within 1 day", () => {
    const repo = makeRepo();
    repo.insert("u1", baseRow);
    expect(repo.checkDuplicate("u1", "2024-03-15", "Edeka", 42.5)).toBe(true);
    expect(repo.checkDuplicate("u1", "2024-03-16", "Edeka", 42.5)).toBe(true);
  });

  it("checkDuplicate is case-insensitive for haendler", () => {
    const repo = makeRepo();
    repo.insert("u1", baseRow);
    expect(repo.checkDuplicate("u1", "2024-03-15", "edeka", 42.5)).toBe(true);
  });

  it("checkDuplicate does not match beyond 1 day", () => {
    const repo = makeRepo();
    repo.insert("u1", baseRow);
    expect(repo.checkDuplicate("u1", "2024-03-17", "Edeka", 42.5)).toBe(false);
  });

  it("checkDuplicate does not match different betrag", () => {
    const repo = makeRepo();
    repo.insert("u1", baseRow);
    expect(repo.checkDuplicate("u1", "2024-03-15", "Edeka", 99)).toBe(false);
  });

  it("checkDuplicate is scoped to user", () => {
    const repo = makeRepo();
    repo.insert("u1", baseRow);
    expect(repo.checkDuplicate("u2", "2024-03-15", "Edeka", 42.5)).toBe(false);
  });
});

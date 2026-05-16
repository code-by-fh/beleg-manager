import { describe, it, expect, beforeEach } from "vitest";
import { openDatabase } from "../src/db/index.js";
import { runMigrations } from "../src/db/migrations.js";
import { createFailedVoiceRepo } from "../src/receipts/failedVoiceRepo.js";

describe("failedVoiceRepo", () => {
  let repo: ReturnType<typeof createFailedVoiceRepo>;

  beforeEach(() => {
    const db = openDatabase(":memory:");
    runMigrations(db);
    repo = createFailedVoiceRepo(db);
  });

  it("saves and lists a failed job", () => {
    const id = repo.save({ userId: "u1", transcript: "Tankrechnung 48 EUR", error: "Gemini timeout" });
    expect(id).toHaveLength(36);
    const jobs = repo.listForUser("u1");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].transcript).toBe("Tankrechnung 48 EUR");
    expect(jobs[0].error).toBe("Gemini timeout");
  });

  it("delete removes the job", () => {
    const id = repo.save({ userId: "u1", transcript: "foo", error: "err" });
    repo.delete("u1", id);
    expect(repo.listForUser("u1")).toHaveLength(0);
  });

  it("delete ignores wrong userId", () => {
    const id = repo.save({ userId: "u1", transcript: "foo", error: "err" });
    repo.delete("u2", id);
    expect(repo.listForUser("u1")).toHaveLength(1);
  });

  it("getById returns null for unknown id", () => {
    expect(repo.getById("u1", "no-such-id")).toBeNull();
  });
});

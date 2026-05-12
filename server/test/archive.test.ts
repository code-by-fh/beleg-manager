import { describe, it, expect } from "vitest";
import { archivePathSegments } from "../src/receipts/archive.js";

describe("archivePathSegments", () => {
  it("returns YYYY/MM segments for a valid date", () => {
    expect(archivePathSegments("2026-05-07")).toEqual({ year: "2026", month: "05" });
  });

  it("zero-pads single-digit months", () => {
    expect(archivePathSegments("2026-1-7")).toEqual({ year: "2026", month: "01" });
  });

  it("falls back to current date for invalid input", () => {
    const out = archivePathSegments("not-a-date", () => new Date("2026-03-15T00:00:00Z"));
    expect(out).toEqual({ year: "2026", month: "03" });
  });
});

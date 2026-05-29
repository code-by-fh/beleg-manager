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

import { describe, it, expect } from "vitest";
import { ReceiptFormZ } from "../validators";

describe("ReceiptFormZ", () => {
  const valid = {
    datum: "2026-05-07",
    haendler: "Mayer",
    betrag: 10,
    mwst: 1,
    waehrung: "EUR",
    kategorie: "Restaurant",
    zahlungsmethode: "(Kredit-)Karte",
    rechnungsnummer: "",
  };
  it("accepts valid input", () => { expect(ReceiptFormZ.parse(valid)).toBeTruthy(); });
  it("rejects bad date", () => { expect(() => ReceiptFormZ.parse({ ...valid, datum: "07.05.2026" })).toThrow(); });
  it("coerces betrag from string", () => { const out = ReceiptFormZ.parse({ ...valid, betrag: "10.5" as any }); expect(out.betrag).toBe(10.5); });
});

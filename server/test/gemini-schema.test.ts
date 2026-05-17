import { describe, it, expect } from "vitest";
import { ExtractionZ, emptyExtraction } from "../src/gemini/schema.js";

describe("ExtractionZ", () => {
  it("parses a complete extraction", () => {
    const result = ExtractionZ.parse({
      datum: "2026-05-07",
      haendler: "Mayer",
      betrag: 45.5,
      mwst: 7.27,
      trinkgeld: null,
      waehrung: "EUR",
      kategorie: "Restaurant",
      zahlungsmethode: "Karte",
      rechnungsnummer: "INV-1",
    });
    expect(result.haendler).toBe("Mayer");
  });

  it("accepts nulls", () => {
    expect(() => ExtractionZ.parse(emptyExtraction())).not.toThrow();
  });

  it("rejects wrong type for betrag", () => {
    expect(() => ExtractionZ.parse({ ...emptyExtraction(), betrag: "abc" })).toThrow();
  });
});

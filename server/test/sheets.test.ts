import { describe, it, expect } from "vitest";
import { rowToValues, valuesToRow, type ReceiptRow } from "../src/google/sheets.js";

const sample: ReceiptRow = {
  id: "u1",
  datum: "2026-05-07",
  haendler: "Restaurant Mayer",
  betrag: 45.5,
  mwst: 7.27,
  waehrung: "EUR",
  kategorie: "Restaurant",
  zahlungsmethode: "Karte",
  rechnungsnummer: "INV-1",
  driveLink: "https://drive/x",
  eingabeTyp: "foto",
  erstelltAm: "2026-05-07T10:00:00Z",
};

describe("sheets row codec", () => {
  it("round-trips a row", () => {
    const back = valuesToRow(rowToValues(sample));
    expect(back).toEqual(sample);
  });

  it("returns null for missing id", () => {
    const v = rowToValues(sample);
    v[0] = "";
    expect(valuesToRow(v)).toBeNull();
  });
});

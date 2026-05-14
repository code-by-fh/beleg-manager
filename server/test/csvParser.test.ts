import { describe, it, expect } from "vitest";
import { parseIngCsv } from "../src/bank/csvParser.js";

// ---------------------------------------------------------------------------
// Realistic ING CSV fixture helpers
// ---------------------------------------------------------------------------

// Real ING column order as of 2026
const HEADER_LINE =
  "Buchung;Wertstellungsdatum;Auftraggeber/Empfänger;Buchungstext;Verwendungszweck;Saldo;Währung;Betrag;Währung";

// Real multi-block preamble: blank lines separate metadata blocks
// The parser must NOT mistake the IBAN line for the header row.
function makeCsv(dataRows: string[]): string {
  return [
    "Umsatzanzeige;Datei erstellt am: 01.05.2026 11:40",
    "",
    "IBAN;DE64 5001 0517 5423 4140 58",
    "Kontoname;Girokonto",
    "Bank;ING",
    "Kunde;Max Mustermann",
    "Zeitraum;01.04.2026 - 01.05.2026",
    "Saldo;1.200,78;EUR",
    "",
    "Sortierung;Datum absteigend",
    "",
    "In der CSV-Datei finden Sie alle bereits gebuchten Umsätze.",
    "",
    HEADER_LINE,
    ...dataRows,
    "",
  ].join("\n");
}

// Columns: Buchung;Wertstellungsdatum;Auftraggeber/Empfänger;Buchungstext;Verwendungszweck;Saldo;Währung;Betrag;Währung
const ROW_REWE =
  "15.04.2026;17.04.2026;REWE MARKT GMBH;Lastschrift;Einkauf Lebensmittel;1.158,28;EUR;-42,50;EUR";
const ROW_STADTWERKE =
  "10.04.2026;10.04.2026;Stadtwerke Musterstadt;Lastschrift;Abschlag April;1.200,78;EUR;-89,00;EUR";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseIngCsv", () => {
  // 1. Happy path: 2 valid rows
  it("parses two valid data rows correctly", () => {
    const csv = makeCsv([ROW_REWE, ROW_STADTWERKE]);
    const { transactions, errors } = parseIngCsv(csv);

    expect(errors).toEqual([]);
    expect(transactions).toHaveLength(2);

    expect(transactions[0]).toMatchObject({
      buchungsdatum: "2026-04-15",
      betrag: -42.5,
      haendler: "REWE MARKT GMBH",
      verwendungszweck: "Einkauf Lebensmittel",
    });

    expect(transactions[1]).toMatchObject({
      buchungsdatum: "2026-04-10",
      betrag: -89.0,
      haendler: "Stadtwerke Musterstadt",
      verwendungszweck: "Abschlag April",
    });
  });

  // 2. Multi-block preamble must not confuse header detection
  it("correctly finds headers despite multiple blank-separated preamble blocks", () => {
    const csv = makeCsv([ROW_REWE]);
    const { transactions, errors } = parseIngCsv(csv);

    expect(errors).toEqual([]);
    expect(transactions).toHaveLength(1);
    // If the IBAN line were mistaken for headers, haendler would be empty/wrong
    expect(transactions[0]!.haendler).toBe("REWE MARKT GMBH");
  });

  // 3. BOM-prefixed input
  it("handles UTF-8 BOM prefix transparently", () => {
    const csv = "﻿" + makeCsv([ROW_REWE, ROW_STADTWERKE]);
    const { transactions, errors } = parseIngCsv(csv);

    expect(errors).toEqual([]);
    expect(transactions).toHaveLength(2);
    expect(transactions[0]!.buchungsdatum).toBe("2026-04-15");
  });

  // 4. Invalid betrag
  it("collects an error for an invalid amount and skips the row", () => {
    const badRow =
      "15.04.2026;17.04.2026;REWE MARKT GMBH;Lastschrift;Einkauf;1.158,28;EUR;abc;EUR";
    const csv = makeCsv([badRow]);
    const { transactions, errors } = parseIngCsv(csv);

    expect(transactions).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Row 1/);
    expect(errors[0]).toMatch(/amount/i);
  });

  // 5. Invalid date format
  it("collects an error for a date that does not match DD.MM.YYYY", () => {
    const badRow =
      "99.99.2024;17.04.2026;REWE MARKT GMBH;Lastschrift;Einkauf;1.158,28;EUR;-42,50;EUR";
    const csv = makeCsv([badRow]);
    const { transactions, errors } = parseIngCsv(csv);

    expect(transactions).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Row 1/);
    expect(errors[0]).toMatch(/date/i);
  });

  // 6. Impossible date (passes range checks but is not a real calendar date)
  it("rejects an impossible date like 31.02.2024", () => {
    const badRow =
      "31.02.2024;17.04.2026;REWE MARKT GMBH;Lastschrift;Einkauf;1.158,28;EUR;-42,50;EUR";
    const csv = makeCsv([badRow]);
    const { transactions, errors } = parseIngCsv(csv);

    expect(transactions).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Row 1/);
    expect(errors[0]).toMatch(/date/i);
  });

  // 7. Empty/preamble-only CSV (no data rows after header)
  it("returns 0 transactions and 0 errors when there are no data rows", () => {
    const csv = makeCsv([]);
    const { transactions, errors } = parseIngCsv(csv);

    expect(transactions).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  // 8. Sensitive fields must NOT be present in output
  it("does not expose sensitive banking fields in parsed transactions", () => {
    const csv = makeCsv([ROW_REWE]);
    const { transactions } = parseIngCsv(csv);

    expect(transactions).toHaveLength(1);
    const tx = transactions[0]!;

    // Only these four keys should be present
    const keys = Object.keys(tx).sort();
    expect(keys).toEqual(
      ["betrag", "buchungsdatum", "haendler", "verwendungszweck"].sort()
    );

    // Spot-check: IBAN from preamble must not leak into any string field
    const stringValues = [tx.haendler, tx.verwendungszweck, tx.buchungsdatum];
    for (const v of stringValues) {
      expect(v).not.toMatch(/DE64/);
      expect(v).not.toMatch(/5001/);
    }
  });
});

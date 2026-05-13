import { describe, it, expect } from "vitest";
import { parseIngCsv } from "../src/bank/csvParser.js";

// ---------------------------------------------------------------------------
// Realistic ING CSV fixture helpers
// ---------------------------------------------------------------------------

const HEADER_LINE =
  "Buchungstag;Valuta;Auftraggeber/Empfänger;Kontonummer;BLZ;Betrag;Gläubiger-ID;Mandatsreferenz;Glaubiger-ID;Kundenreferenz;Verwendungszweck;Kategorie;Tags";

function makeCsv(dataRows: string[]): string {
  return [
    "Umsatzanzeige;;",
    "Kontonummer:;DE12 3456 7890 1234 5678 90 / Girokonto;",
    "Von:;01.04.2026;",
    "Bis:;30.04.2026;",
    `Kontostand:;"1.234,56 EUR";`,
    // blank line — parser finds this as the preamble/data separator
    "",
    HEADER_LINE,
    ...dataRows,
    "",
  ].join("\n");
}

const ROW_REWE =
  '15.04.2026;17.04.2026;REWE MARKT GMBH;DE99XXXX;XXXXXX;"-42,50";;;;"";Einkauf Lebensmittel;Lebensmittel;';
const ROW_STADTWERKE =
  '10.04.2026;10.04.2026;Stadtwerke Musterstadt;DE88XXXX;XXXXXX;"-89,00";;;;"";Abschlag April;Energie;';

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

  // 2. BOM-prefixed input
  it("handles UTF-8 BOM prefix transparently", () => {
    const csv = "﻿" + makeCsv([ROW_REWE, ROW_STADTWERKE]);
    const { transactions, errors } = parseIngCsv(csv);

    expect(errors).toEqual([]);
    expect(transactions).toHaveLength(2);
    expect(transactions[0]!.buchungsdatum).toBe("2026-04-15");
  });

  // 3. Invalid betrag
  it("collects an error for an invalid amount and skips the row", () => {
    const badRow =
      '15.04.2026;17.04.2026;REWE MARKT GMBH;DE99XXXX;XXXXXX;abc;;;;"";Einkauf;Lebensmittel;';
    const csv = makeCsv([badRow]);
    const { transactions, errors } = parseIngCsv(csv);

    expect(transactions).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Row 1/);
    expect(errors[0]).toMatch(/amount/i);
  });

  // 4. Invalid date format
  it("collects an error for a date that does not match DD.MM.YYYY", () => {
    const badRow =
      '99.99.2024;17.04.2026;REWE MARKT GMBH;DE99XXXX;XXXXXX;"-42,50";;;;"";Einkauf;Lebensmittel;';
    const csv = makeCsv([badRow]);
    const { transactions, errors } = parseIngCsv(csv);

    expect(transactions).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Row 1/);
    expect(errors[0]).toMatch(/date/i);
  });

  // 5. Impossible date (passes range checks but is not a real calendar date)
  it("rejects an impossible date like 31.02.2024", () => {
    const badRow =
      '31.02.2024;17.04.2026;REWE MARKT GMBH;DE99XXXX;XXXXXX;"-42,50";;;;"";Einkauf;Lebensmittel;';
    const csv = makeCsv([badRow]);
    const { transactions, errors } = parseIngCsv(csv);

    expect(transactions).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Row 1/);
    expect(errors[0]).toMatch(/date/i);
  });

  // 6. Empty/preamble-only CSV (no data rows after header)
  it("returns 0 transactions and 0 errors when there are no data rows", () => {
    const csv = makeCsv([]);
    const { transactions, errors } = parseIngCsv(csv);

    expect(transactions).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  // 7. Sensitive fields must NOT be present in output
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

    // Spot-check: no raw IBAN/BIC values leak into string fields
    const stringValues = [tx.haendler, tx.verwendungszweck, tx.buchungsdatum];
    for (const v of stringValues) {
      expect(v).not.toMatch(/DE99XXXX/);
      expect(v).not.toMatch(/XXXXXX/);
    }
  });
});

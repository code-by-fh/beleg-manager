/**
 * ING Germany CSV export parser.
 *
 * Parses the multi-line preamble format exported by ING Germany online banking.
 * Strips all sensitive fields (IBAN, BIC, creditor IDs, mandate refs, etc.)
 * and returns only the data needed for receipt/transaction management.
 *
 * NEVER throws — all per-row errors are collected into the `errors` array.
 */

export type ParsedTransaction = {
  buchungsdatum: string;    // ISO YYYY-MM-DD
  betrag: number;           // signed float (negative = debit/Ausgabe, positive = credit)
  haendler: string;         // trimmed Auftraggeber/Empfänger
  verwendungszweck: string; // Verwendungszweck, optionally appended with Kundenreferenz
};

export function parseIngCsv(csvText: string): {
  transactions: ParsedTransaction[];
  errors: string[];
} {
  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];

  try {
    // 1. Strip UTF-8 BOM (U+FEFF)
    const text = csvText.startsWith("﻿") ? csvText.slice(1) : csvText;

    // 2. Split into lines — handle both \r\n and \n
    const lines = text.split(/\r?\n/);

    // 3. Find the first blank line (empty after trim)
    let blankLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if ((lines[i] ?? "").trim() === "") {
        blankLineIndex = i;
        break;
      }
    }

    if (blankLineIndex === -1) {
      errors.push("Could not find blank separator line between preamble and data");
      return { transactions, errors };
    }

    // 4. The next non-blank line after the blank line is the column header row
    let headerLineIndex = -1;
    for (let i = blankLineIndex + 1; i < lines.length; i++) {
      if ((lines[i] ?? "").trim() !== "") {
        headerLineIndex = i;
        break;
      }
    }

    if (headerLineIndex === -1) {
      errors.push("Could not find column header row after blank separator line");
      return { transactions, errors };
    }

    // 5. Parse column headers: split on `;`, strip surrounding quotes, trim, lowercase for matching
    const rawHeaders = splitSemicolon(lines[headerLineIndex] ?? "");
    const headers = rawHeaders.map((h) => stripQuotes(h).trim().toLowerCase());

    // Build index map for the columns we care about
    const colIndex = {
      buchungstag: headers.indexOf("buchungstag"),
      haendler: findHeaderIndex(headers, [
        "auftraggeber/empfänger",
        "auftraggeber/empfänger",
        "auftraggeber/empfanger",
      ]),
      betrag: headers.indexOf("betrag"),
      verwendungszweck: headers.indexOf("verwendungszweck"),
      kundenreferenz: headers.indexOf("kundenreferenz"),
    };

    // Validate required columns exist
    const missing: string[] = [];
    if (colIndex.buchungstag === -1) missing.push("Buchungstag");
    if (colIndex.haendler === -1) missing.push("Auftraggeber/Empfänger");
    if (colIndex.betrag === -1) missing.push("Betrag");
    if (colIndex.verwendungszweck === -1) missing.push("Verwendungszweck");

    if (missing.length > 0) {
      errors.push(`Missing required columns: ${missing.join(", ")}`);
      errors.push(`Found headers: ${headers.join(" | ")}`);
      return { transactions, errors };
    }

    // 6. All subsequent non-empty lines after the header are data rows
    const dataLines = lines.slice(headerLineIndex + 1);

    // Row counter for error messages — 1-based, counting only non-empty rows
    let rowNum = 0;

    for (const line of dataLines) {
      // 6a. Skip empty rows silently
      if (line.trim() === "") continue;

      rowNum++;

      // 7. Split on `;`, strip surrounding `"` quotes, trim
      const fields = splitSemicolon(line).map((f) => stripQuotes(f).trim());

      const rawBuchungstag = getField(fields, colIndex.buchungstag);
      const rawBetrag = getField(fields, colIndex.betrag);
      const rawHaendler = getField(fields, colIndex.haendler);
      const rawVerwendungszweck = getField(fields, colIndex.verwendungszweck);
      const rawKundenreferenz = getField(fields, colIndex.kundenreferenz);

      // Convert Buchungstag DD.MM.YYYY → ISO YYYY-MM-DD
      const buchungsdatum = parseDateDMY(rawBuchungstag);
      if (buchungsdatum === null) {
        errors.push(
          `Row ${rowNum}: invalid date '${rawBuchungstag}' (expected DD.MM.YYYY)`
        );
        continue;
      }

      // Convert Betrag: remove `.` (thousand separator), replace `,` with `.`, parseFloat
      const betragNormalized = rawBetrag.replace(/\./g, "").replace(",", ".");
      const betrag = parseFloat(betragNormalized);
      if (isNaN(betrag)) {
        errors.push(
          `Row ${rowNum}: could not parse amount '${rawBetrag}'`
        );
        continue;
      }

      // Build verwendungszweck: start with Verwendungszweck field;
      // if Kundenreferenz is non-empty AND different, append ` | ` + Kundenreferenz
      let verwendungszweck = rawVerwendungszweck;
      if (
        rawKundenreferenz !== "" &&
        rawKundenreferenz !== rawVerwendungszweck
      ) {
        verwendungszweck =
          verwendungszweck === ""
            ? rawKundenreferenz
            : `${verwendungszweck} | ${rawKundenreferenz}`;
      }

      transactions.push({
        buchungsdatum,
        betrag,
        haendler: rawHaendler,
        verwendungszweck,
      });
    }
  } catch (err) {
    errors.push(
      `Unexpected parser error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return { transactions, errors };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Split a CSV line on semicolons.
 * Does NOT handle quoted fields containing semicolons — ING CSV does not use them.
 */
function splitSemicolon(line: string): string[] {
  return line.split(";");
}

/**
 * Strip a single layer of surrounding double-quotes from a field value.
 */
function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Safely get a field by index, returning "" if out of bounds.
 */
function getField(fields: string[], index: number): string {
  if (index < 0 || index >= fields.length) return "";
  return fields[index] ?? "";
}

/**
 * Return the index of the first header that matches any of the candidates.
 */
function findHeaderIndex(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = headers.indexOf(candidate);
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Parse a date in DD.MM.YYYY format and return ISO YYYY-MM-DD string,
 * or null if the input does not match.
 */
function parseDateDMY(raw: string): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw.trim());
  if (!match) return null;

  const [, dd, mm, yyyy] = match;
  // Basic range validation
  const day = parseInt(dd as string, 10);
  const month = parseInt(mm as string, 10);
  const year = parseInt(yyyy as string, 10);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1900 || year > 2200) return null;

  return `${yyyy}-${mm}-${dd}`;
}

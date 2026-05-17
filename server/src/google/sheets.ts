import { google, type sheets_v4 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

export type SheetsClient = sheets_v4.Sheets;

export const SHEET_HEADER = [
  "id",
  "datum",
  "haendler",
  "betrag",
  "mwst",
  "trinkgeld",
  "waehrung",
  "kategorie",
  "zahlungsmethode",
  "rechnungsnummer",
  "drive_link",
  "eingabe_typ",
  "erstellt_am",
] as const;

export const SHEET_TAB_NAME = "Belege";

export function sheetsFor(auth: OAuth2Client): SheetsClient {
  return google.sheets({ version: "v4", auth });
}

export async function spreadsheetExists(sheets: SheetsClient, spreadsheetId: string): Promise<boolean> {
  try {
    await sheets.spreadsheets.get({ spreadsheetId, fields: "spreadsheetId" });
    return true;
  } catch {
    return false;
  }
}

export async function createSpreadsheet(
  sheets: SheetsClient,
  title: string
): Promise<string> {
  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [{ properties: { title: SHEET_TAB_NAME } }],
    },
  });
  if (!res.data.spreadsheetId) throw new Error("Spreadsheet create returned no id");
  await sheets.spreadsheets.values.update({
    spreadsheetId: res.data.spreadsheetId,
    range: `${SHEET_TAB_NAME}!A1:M1`,
    valueInputOption: "RAW",
    requestBody: { values: [SHEET_HEADER as unknown as string[]] },
  });
  return res.data.spreadsheetId;
}

export async function moveSpreadsheetIntoFolder(
  drive: import("googleapis").drive_v3.Drive,
  spreadsheetId: string,
  folderId: string
): Promise<void> {
  const file = await drive.files.get({ fileId: spreadsheetId, fields: "parents" });
  const prev = (file.data.parents ?? []).join(",");
  await drive.files.update({
    fileId: spreadsheetId,
    addParents: folderId,
    removeParents: prev || undefined,
    fields: "id, parents",
  });
}

export type ReceiptRow = {
  id: string;
  datum: string;
  haendler: string;
  betrag: number;
  mwst: number;
  trinkgeld: number;
  waehrung: string;
  kategorie: string;
  zahlungsmethode: string;
  rechnungsnummer: string;
  driveLink: string;
  eingabeTyp: "foto" | "sprache" | "drive" | "telegram" | "email";
  erstelltAm: string;
};

// ──── Splits ────────────────────────────────────────────────────────────────

export const SPLITS_TAB_NAME = "Splits";

export const SPLITS_HEADER = [
  "split_id",
  "receipt_id",
  "haendler",
  "datum",
  "gesamtbetrag",
  "waehrung",
  "person",
  "betrag",
  "beglichen",
  "erstellt_am",
  "status",
] as const;

export type SplitStatus = "offen" | "angefordert" | "unterwegs" | "ohne_verrechnung";

export type SplitRow = {
  splitId: string;
  receiptId: string;
  haendler: string;
  datum: string;
  gesamtbetrag: number;
  waehrung: string;
  person: string;
  betrag: number;
  beglichen: boolean;
  erstelltAm: string;
  status: SplitStatus;
};

function getStr(values: (string | number)[], i: number, def = "") { return String(values[i] ?? def); }
function getNum(values: (string | number)[], i: number, def = 0) {
  const v = values[i];
  if (v === undefined || v === null || v === "") return def;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[^0-9,.-]/g, "").replace(",", "."));
  return isNaN(n) ? def : n;
}

const VALID_STATUSES = new Set<string>(["offen", "angefordert", "unterwegs", "ohne_verrechnung"]);

function splitToValues(r: SplitRow): (string | number)[] {
  return [r.splitId, r.receiptId, r.haendler, r.datum, r.gesamtbetrag, r.waehrung, r.person, r.betrag, r.beglichen ? "1" : "0", r.erstelltAm, r.status];
}

function valuesToSplit(values: (string | number)[]): SplitRow | null {
  if (!values || values.length < 10) return null;
  const splitId = String(values[0] || "");
  if (!splitId || splitId === "split_id") return null;
  const rawStatus = getStr(values, 10);
  return {
    splitId,
    receiptId: getStr(values, 1),
    haendler: getStr(values, 2),
    datum: getStr(values, 3),
    gesamtbetrag: getNum(values, 4),
    waehrung: getStr(values, 5, "EUR"),
    person: getStr(values, 6),
    betrag: getNum(values, 7),
    beglichen: getStr(values, 8) === "1",
    erstelltAm: getStr(values, 9),
    status: (VALID_STATUSES.has(rawStatus) ? rawStatus : "offen") as SplitStatus,
  };
}

const confirmedSplitsTabs = new Set<string>();

export async function ensureSplitsTab(sheets: SheetsClient, spreadsheetId: string): Promise<void> {
  if (confirmedSplitsTabs.has(spreadsheetId)) return;
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === SPLITS_TAB_NAME);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: SPLITS_TAB_NAME } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SPLITS_TAB_NAME}!A1:K1`,
      valueInputOption: "RAW",
      requestBody: { values: [SPLITS_HEADER as unknown as string[]] },
    });
  }
  confirmedSplitsTabs.add(spreadsheetId);
}

export async function readSplits(sheets: SheetsClient, spreadsheetId: string): Promise<SplitRow[]> {
  await ensureSplitsTab(sheets, spreadsheetId);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SPLITS_TAB_NAME}!A2:K` });
  return ((res.data.values ?? []) as (string | number)[][]).map(valuesToSplit).filter((r): r is SplitRow => r !== null);
}

export async function appendSplit(sheets: SheetsClient, spreadsheetId: string, row: SplitRow): Promise<void> {
  await ensureSplitsTab(sheets, spreadsheetId);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SPLITS_TAB_NAME}!A:J`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [splitToValues(row)] },
  });
}

export async function updateSplitBeglichen(sheets: SheetsClient, spreadsheetId: string, splitId: string, beglichen: boolean): Promise<boolean> {
  const idRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SPLITS_TAB_NAME}!A:A` });
  const idCol = (idRes.data.values ?? []) as string[][];
  const idx = idCol.findIndex((r) => r[0] === splitId);
  if (idx === -1) return false;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SPLITS_TAB_NAME}!I${idx + 1}`,
    valueInputOption: "RAW",
    requestBody: { values: [[beglichen ? "1" : "0"]] },
  });
  return true;
}

export async function updateSplitStatus(sheets: SheetsClient, spreadsheetId: string, splitId: string, status: SplitStatus): Promise<boolean> {
  const idRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SPLITS_TAB_NAME}!A:A` });
  const idCol = (idRes.data.values ?? []) as string[][];
  const idx = idCol.findIndex((r) => r[0] === splitId);
  if (idx === -1) return false;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SPLITS_TAB_NAME}!K${idx + 1}`,
    valueInputOption: "RAW",
    requestBody: { values: [[status]] },
  });
  return true;
}

export async function deleteSplitRow(sheets: SheetsClient, spreadsheetId: string, splitId: string): Promise<boolean> {
  const idRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SPLITS_TAB_NAME}!A:A` });
  const idCol = (idRes.data.values ?? []) as string[][];
  const idx = idCol.findIndex((r) => r[0] === splitId);
  if (idx === -1) return false;

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === SPLITS_TAB_NAME);
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined) return false;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: idx, endIndex: idx + 1 } } }],
    },
  });
  return true;
}

// ──────────────────────────────────────────────────────────────────────────────

export function rowToValues(r: ReceiptRow): (string | number)[] {
  return [
    r.id,
    r.datum,
    r.haendler,
    r.betrag,
    r.mwst,
    r.trinkgeld,
    r.waehrung,
    r.kategorie,
    r.zahlungsmethode,
    r.rechnungsnummer,
    r.driveLink,
    r.eingabeTyp,
    r.erstelltAm,
  ];
}

export function valuesToRow(values: (string | number)[]): ReceiptRow | null {
  if (!values || values.length === 0) return null;
  const id = String(values[0] || "");
  if (!id || id === "id") return null;

  // Legacy format (12 cols, before trinkgeld was added)
  if (values.length < 13) {
    return {
      id,
      datum: getStr(values, 1),
      haendler: getStr(values, 2),
      betrag: getNum(values, 3),
      mwst: getNum(values, 4),
      trinkgeld: 0,
      waehrung: getStr(values, 5, "EUR"),
      kategorie: getStr(values, 6),
      zahlungsmethode: getStr(values, 7),
      rechnungsnummer: getStr(values, 8),
      driveLink: getStr(values, 9),
      eingabeTyp: (getStr(values, 10) as ReceiptRow["eingabeTyp"]) || "foto",
      erstelltAm: getStr(values, 11),
    };
  }

  return {
    id,
    datum: getStr(values, 1),
    haendler: getStr(values, 2),
    betrag: getNum(values, 3),
    mwst: getNum(values, 4),
    trinkgeld: getNum(values, 5),
    waehrung: getStr(values, 6, "EUR"),
    kategorie: getStr(values, 7),
    zahlungsmethode: getStr(values, 8),
    rechnungsnummer: getStr(values, 9),
    driveLink: getStr(values, 10),
    eingabeTyp: (getStr(values, 11) as ReceiptRow["eingabeTyp"]) || "foto",
    erstelltAm: getStr(values, 12),
  };
}

export async function appendRow(
  sheets: SheetsClient,
  spreadsheetId: string,
  row: ReceiptRow
): Promise<void> {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_TAB_NAME}!A:M`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [rowToValues(row)] },
  });
}

export async function checkDuplicateRow(
  sheets: SheetsClient,
  spreadsheetId: string,
  row: { datum: string; haendler: string; betrag: number }
): Promise<boolean> {
  const scanRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB_NAME}!A2:D`,
  });
  const rawRows = (scanRes.data.values ?? []) as string[][];

  const targetMs = new Date(row.datum).getTime();
  const oneDayMs = 86_400_000;
  const haendlerLc = row.haendler.trim().toLowerCase();

  return rawRows.some((r) => {
    const rowMs = new Date(r[1] ?? "").getTime();
    const rowBetrag = parseFloat(String(r[3] ?? "").replace(",", "."));
    return (
      (r[2] ?? "").trim().toLowerCase() === haendlerLc &&
      rowBetrag === row.betrag &&
      !isNaN(rowMs) &&
      Math.abs(rowMs - targetMs) <= oneDayMs
    );
  });
}

export async function readAllRows(
  sheets: SheetsClient,
  spreadsheetId: string
): Promise<ReceiptRow[]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB_NAME}!A2:M`,
  });
  const rows = (res.data.values ?? []) as (string | number)[][];
  return rows
    .map((v) => valuesToRow(v))
    .filter((r): r is ReceiptRow => r !== null);
}

export async function updateRow(
  sheets: SheetsClient,
  spreadsheetId: string,
  row: ReceiptRow
): Promise<boolean> {
  const idRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB_NAME}!A:A`,
  });
  const idColumn = (idRes.data.values ?? []) as string[][];
  const sheetIdx = idColumn.findIndex((r) => r[0] === row.id);
  if (sheetIdx === -1) return false;
  const sheetRow = sheetIdx + 1;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_TAB_NAME}!A${sheetRow}:M${sheetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [rowToValues(row)] },
  });
  return true;
}

export async function deleteRow(
  sheets: SheetsClient,
  spreadsheetId: string,
  id: string
): Promise<boolean> {
  const idRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB_NAME}!A:A`,
  });
  const idColumn = (idRes.data.values ?? []) as string[][];
  const sheetIdx = idColumn.findIndex((r) => r[0] === id);
  if (sheetIdx === -1) return false;

  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === SHEET_TAB_NAME
  );
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined) return false;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: sheetIdx,
              endIndex: sheetIdx + 1,
            },
          },
        },
      ],
    },
  });
  return true;
}

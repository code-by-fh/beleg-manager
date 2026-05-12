import { google, type sheets_v4 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

export type SheetsClient = sheets_v4.Sheets;

export const SHEET_HEADER = [
  "id",
  "datum",
  "haendler",
  "betrag",
  "mwst",
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
    range: `${SHEET_TAB_NAME}!A1:L1`,
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
  waehrung: string;
  kategorie: string;
  zahlungsmethode: string;
  rechnungsnummer: string;
  driveLink: string;
  eingabeTyp: "foto" | "sprache" | "drive";
  erstelltAm: string;
};

export function rowToValues(r: ReceiptRow): (string | number)[] {
  return [
    r.id,
    r.datum,
    r.haendler,
    r.betrag,
    r.mwst,
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
  if (values.length < 12) return null;
  const [id, datum, haendler, betrag, mwst, waehrung, kategorie, zahlungsmethode, rechnungsnummer, driveLink, eingabeTyp, erstelltAm] = values as string[];
  if (!id) return null;
  return {
    id,
    datum: datum ?? "",
    haendler: haendler ?? "",
    betrag: Number(betrag ?? 0),
    mwst: Number(mwst ?? 0),
    waehrung: waehrung ?? "EUR",
    kategorie: kategorie ?? "",
    zahlungsmethode: zahlungsmethode ?? "",
    rechnungsnummer: rechnungsnummer ?? "",
    driveLink: driveLink ?? "",
    eingabeTyp: (eingabeTyp as ReceiptRow["eingabeTyp"]) ?? "foto",
    erstelltAm: erstelltAm ?? "",
  };
}

export async function appendRow(
  sheets: SheetsClient,
  spreadsheetId: string,
  row: ReceiptRow
): Promise<void> {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_TAB_NAME}!A:L`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [rowToValues(row)] },
  });
}

export async function readAllRows(
  sheets: SheetsClient,
  spreadsheetId: string
): Promise<ReceiptRow[]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB_NAME}!A2:L`,
  });
  const rows = (res.data.values ?? []) as (string | number)[][];
  return rows
    .map((v) => valuesToRow(v))
    .filter((r): r is ReceiptRow => r !== null);
}

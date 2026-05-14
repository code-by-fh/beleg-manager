import type { Extraction } from "../gemini/schema.js";
import type { ReceiptRow } from "../google/sheets.js";

export type PendingSource =
  | { kind: "upload"; mimeType: string; buffer: Buffer }
  | { kind: "voice" }
  | { kind: "drive"; fileId: string; mimeType: string }
  | { kind: "telegram"; mimeType: string; buffer: Buffer; chatId: number }
  | { kind: "email"; mimeType: string; buffer: Buffer };

export const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export const SOURCE_KIND_TO_EINGABE_TYP: Record<PendingSource["kind"], ReceiptRow["eingabeTyp"]> = {
  upload: "foto",
  drive: "drive",
  telegram: "telegram",
  email: "email",
  voice: "sprache",
};

export type PendingReceipt = {
  id: string;
  userId: string;
  source: PendingSource;
  extraction: Extraction;
  createdAt: number;
};

export type ConfirmInput = {
  pendingId: string;
  datum: string;
  haendler: string;
  betrag: number;
  mwst: number;
  waehrung: string;
  kategorie: string;
  zahlungsmethode: string;
  rechnungsnummer: string;
};

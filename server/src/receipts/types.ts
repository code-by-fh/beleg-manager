import type { Extraction } from "../gemini/schema.js";

export type PendingSource =
  | { kind: "upload"; mimeType: string; buffer: Buffer }
  | { kind: "voice" }
  | { kind: "drive"; fileId: string; mimeType: string };

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

export type Extraction = {
  datum: string | null;
  haendler: string | null;
  betrag: number | null;
  mwst: number | null;
  waehrung: string | null;
  kategorie: string | null;
  zahlungsmethode: string | null;
  rechnungsnummer: string | null;
};

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

export type EingabeTyp = ReceiptRow["eingabeTyp"];

export type PendingReceiptResponse = {
  pendingId: string;
  extraction: Extraction;
  fileName?: string;
};

export type DriveInboxFile = {
  id: string;
  name: string;
  mimeType: string;
  status: "new" | "pending_review" | "failed";
  extracted: Extraction | null;
};

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
  linkedBankTxId: string | null;
};

export type StatsSummary = {
  monthTotal: number;
  prevMonthTotal: number;
  yearTotal: number;
  count: number;
  topCategory: string | null;
  avgPerReceipt: number;
  mwstYear: number;
  maxBetrag: number;
};

export type MonthlyPoint = { ym: string; total: number };
export type CategoryBucket = { kategorie: string; total: number };
export type TopMerchantBucket = { haendler: string; total: number };
export type PaymentMethodBucket = { methode: string; total: number; count: number };

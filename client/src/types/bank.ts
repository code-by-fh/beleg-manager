export type BankTransaction = {
  id: string;
  userId: string;
  buchungsdatum: string;
  betrag: number;
  haendler: string;
  verwendungszweck: string;
  matchStatus: "unmatched" | "matched" | "ignored";
  matchedReceiptId: string | null;
  matchConfidence: "high" | "medium" | "low" | "manual" | null;
  importedAt: number;
};

export type ImportResult = {
  imported: number;
  autoMatched: number;
  unmatched: number;
  parseErrors: string[];
};

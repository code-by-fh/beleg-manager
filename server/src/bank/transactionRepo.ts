import type { Db } from "../db/index.js";

export class NotFoundError extends Error {}

export type BankTransaction = {
  id: string;
  userId: string;
  buchungsdatum: string;       // ISO YYYY-MM-DD
  betrag: number;
  haendler: string;
  verwendungszweck: string;
  matchStatus: "unmatched" | "matched" | "ignored";
  matchedReceiptId: string | null;
  matchConfidence: "high" | "medium" | "low" | "manual" | null;
  importedAt: number;          // Unix ms timestamp
};

type DbRow = {
  id: string;
  user_id: string;
  buchungsdatum: string;
  betrag: number;
  haendler: string;
  verwendungszweck: string;
  match_status: "unmatched" | "matched" | "ignored";
  matched_receipt_id: string | null;
  match_confidence: "high" | "medium" | "low" | "manual" | null;
  imported_at: number;
};

function rowToTransaction(row: DbRow): BankTransaction {
  return {
    id: row.id,
    userId: row.user_id,
    buchungsdatum: row.buchungsdatum,
    betrag: row.betrag,
    haendler: row.haendler,
    verwendungszweck: row.verwendungszweck,
    matchStatus: row.match_status,
    matchedReceiptId: row.matched_receipt_id,
    matchConfidence: row.match_confidence,
    importedAt: row.imported_at,
  };
}

export function createTransactionRepo(db: Db) {
  return {
    insertMany(userId: string, rows: Omit<BankTransaction, "importedAt" | "userId">[]): void {
      const stmt = db.prepare(
        `INSERT OR IGNORE INTO bank_transactions
          (id, user_id, buchungsdatum, betrag, haendler, verwendungszweck,
           match_status, matched_receipt_id, match_confidence, imported_at)
         VALUES
          (@id, @userId, @buchungsdatum, @betrag, @haendler, @verwendungszweck,
           @matchStatus, @matchedReceiptId, @matchConfidence, @importedAt)`
      );

      const importedAt = Date.now();
      const insertAll = db.transaction((items: Omit<BankTransaction, "importedAt" | "userId">[]) => {
        for (const row of items) {
          stmt.run({ ...row, userId, importedAt });
        }
      });

      insertAll(rows);
    },

    listByUser(userId: string): BankTransaction[] {
      const rows = db
        .prepare(
          `SELECT id, user_id, buchungsdatum, betrag, haendler, verwendungszweck,
                  match_status, matched_receipt_id, match_confidence, imported_at
           FROM bank_transactions
           WHERE user_id = ?
           ORDER BY buchungsdatum DESC`
        )
        .all(userId) as DbRow[];

      return rows.map(rowToTransaction);
    },

    updateMatch(
      id: string,
      userId: string,
      receiptId: string | null,
      confidence: "high" | "medium" | "low" | "manual"
    ): void {
      if (receiptId === null) {
        const result = db.prepare(
          `UPDATE bank_transactions
           SET match_status = 'unmatched', matched_receipt_id = NULL, match_confidence = NULL
           WHERE id = ? AND user_id = ?`
        ).run(id, userId);
        if (result.changes === 0) throw new NotFoundError(`Transaction ${id} not found or access denied`);
      } else {
        const result = db.prepare(
          `UPDATE bank_transactions
           SET match_status = 'matched', matched_receipt_id = @receiptId, match_confidence = @confidence
           WHERE id = @id AND user_id = @userId`
        ).run({ id, userId, receiptId, confidence });
        if (result.changes === 0) throw new NotFoundError(`Transaction ${id} not found or access denied`);
      }
    },

    updateStatus(id: string, userId: string, status: "unmatched" | "matched" | "ignored"): void {
      const result = db.prepare(
        `UPDATE bank_transactions SET match_status = @status WHERE id = @id AND user_id = @userId`
      ).run({ id, userId, status });
      if (result.changes === 0) throw new NotFoundError(`Transaction ${id} not found or access denied`);
    },

    clearByUser(userId: string): number {
      const result = db.prepare("DELETE FROM bank_transactions WHERE user_id = ?").run(userId);
      return result.changes;
    },
  };
}

export type TransactionRepo = ReturnType<typeof createTransactionRepo>;

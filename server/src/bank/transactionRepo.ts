import type { Db } from "../db/index.js";
import { encrypt, decrypt } from "./crypto.js";

export class NotFoundError extends Error {}

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
    haendler: decrypt(row.haendler),
    verwendungszweck: decrypt(row.verwendungszweck),
    matchStatus: row.match_status,
    matchedReceiptId: row.matched_receipt_id,
    matchConfidence: row.match_confidence,
    importedAt: row.imported_at,
  };
}

const SELECT_COLS = `id, user_id, buchungsdatum, betrag, haendler, verwendungszweck,
                     match_status, matched_receipt_id, match_confidence, imported_at`;

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
          stmt.run({
            ...row,
            userId,
            importedAt,
            haendler: encrypt(row.haendler),
            verwendungszweck: encrypt(row.verwendungszweck),
          });
        }
      });

      insertAll(rows);
    },

    getDeduplicateKeys(userId: string): Set<string> {
      const rows = db
        .prepare("SELECT buchungsdatum, betrag, haendler FROM bank_transactions WHERE user_id = ?")
        .all(userId) as Array<{ buchungsdatum: string; betrag: number; haendler: string }>;
      return new Set(rows.map((r) => `${r.buchungsdatum}|${r.betrag}|${decrypt(r.haendler)}`));
    },

    listByUser(userId: string, filter?: { from?: string; to?: string }): BankTransaction[] {
      const base = `SELECT ${SELECT_COLS} FROM bank_transactions WHERE user_id = ?`;
      let rows: DbRow[];

      if (filter?.from && filter?.to) {
        rows = db
          .prepare(`${base} AND buchungsdatum >= ? AND buchungsdatum <= ? ORDER BY buchungsdatum DESC`)
          .all(userId, filter.from, filter.to) as DbRow[];
      } else if (filter?.from) {
        rows = db
          .prepare(`${base} AND buchungsdatum >= ? ORDER BY buchungsdatum DESC`)
          .all(userId, filter.from) as DbRow[];
      } else if (filter?.to) {
        rows = db
          .prepare(`${base} AND buchungsdatum <= ? ORDER BY buchungsdatum DESC`)
          .all(userId, filter.to) as DbRow[];
      } else {
        rows = db.prepare(`${base} ORDER BY buchungsdatum DESC`).all(userId) as DbRow[];
      }

      return rows.map(rowToTransaction);
    },

    listUnmatched(userId: string): BankTransaction[] {
      const rows = db
        .prepare(
          `SELECT ${SELECT_COLS} FROM bank_transactions
           WHERE user_id = ? AND match_status = 'unmatched' AND betrag < 0
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
        const result = db
          .prepare(
            `UPDATE bank_transactions
             SET match_status = 'unmatched', matched_receipt_id = NULL, match_confidence = NULL
             WHERE id = ? AND user_id = ?`
          )
          .run(id, userId);
        if (result.changes === 0) throw new NotFoundError(`Transaction ${id} not found or access denied`);
      } else {
        const result = db
          .prepare(
            `UPDATE bank_transactions
             SET match_status = 'matched', matched_receipt_id = @receiptId, match_confidence = @confidence
             WHERE id = @id AND user_id = @userId`
          )
          .run({ id, userId, receiptId, confidence });
        if (result.changes === 0) throw new NotFoundError(`Transaction ${id} not found or access denied`);
      }
    },

    updateStatus(id: string, userId: string, status: "unmatched" | "matched" | "ignored"): void {
      const result = db
        .prepare(
          `UPDATE bank_transactions SET match_status = @status WHERE id = @id AND user_id = @userId`
        )
        .run({ id, userId, status });
      if (result.changes === 0) throw new NotFoundError(`Transaction ${id} not found or access denied`);
    },

    deleteById(id: string, userId: string): void {
      const result = db
        .prepare("DELETE FROM bank_transactions WHERE id = ? AND user_id = ?")
        .run(id, userId);
      if (result.changes === 0) throw new NotFoundError(`Transaction ${id} not found or access denied`);
    },

    deleteByRange(userId: string, from: string, to: string): number {
      const result = db
        .prepare(
          "DELETE FROM bank_transactions WHERE user_id = ? AND buchungsdatum >= ? AND buchungsdatum <= ?"
        )
        .run(userId, from, to);
      return result.changes;
    },

    countByRange(userId: string, from: string, to: string): number {
      const row = db
        .prepare(
          "SELECT COUNT(*) as count FROM bank_transactions WHERE user_id = ? AND buchungsdatum >= ? AND buchungsdatum <= ?"
        )
        .get(userId, from, to) as { count: number };
      return row.count;
    },
  };
}

export type TransactionRepo = ReturnType<typeof createTransactionRepo>;

import { v4 as uuidv4 } from "uuid";
import type { Db } from "../db/index.js";

export type SplitRequestStatus = "pending" | "accepted" | "rejected" | "cancelled";

export type ReceiptMeta = {
  haendler: string;
  datum: string;
  gesamtbetrag: number;
  waehrung: string;
};

export type SplitRequestRow = {
  id: string;
  fromUserId: string;
  toUserId: string;
  receiptId: string;
  receiptMeta: ReceiptMeta;
  betrag: number;
  nachricht: string;
  status: SplitRequestStatus;
  createdAt: number;
  updatedAt: number;
};

type RawRow = Omit<SplitRequestRow, "receiptMeta"> & { receiptMeta: string };

function parseRow(raw: RawRow): SplitRequestRow {
  return { ...raw, receiptMeta: JSON.parse(raw.receiptMeta) as ReceiptMeta };
}

export function createSplitRequestRepo(db: Db) {
  return {
    create(input: {
      fromUserId: string;
      toUserId: string;
      receiptId: string;
      receiptMeta: ReceiptMeta;
      betrag: number;
      nachricht: string;
    }): SplitRequestRow {
      const now = Date.now();
      const id = uuidv4();
      db.prepare(
        `INSERT INTO split_requests
          (id, from_user_id, to_user_id, receipt_id, receipt_meta, betrag, nachricht, status, created_at, updated_at)
         VALUES (@id, @fromUserId, @toUserId, @receiptId, @receiptMeta, @betrag, @nachricht, 'pending', @now, @now)`
      ).run({
        id,
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
        receiptId: input.receiptId,
        receiptMeta: JSON.stringify(input.receiptMeta),
        betrag: input.betrag,
        nachricht: input.nachricht,
        now,
      });
      return this.getById(id)!;
    },

    getById(id: string): SplitRequestRow | undefined {
      const raw = db.prepare(
        `SELECT id,
          from_user_id AS fromUserId,
          to_user_id AS toUserId,
          receipt_id AS receiptId,
          receipt_meta AS receiptMeta,
          betrag, nachricht, status,
          created_at AS createdAt,
          updated_at AS updatedAt
         FROM split_requests WHERE id = ?`
      ).get(id) as RawRow | undefined;
      return raw ? parseRow(raw) : undefined;
    },

    listIncoming(toUserId: string): SplitRequestRow[] {
      const rows = db.prepare(
        `SELECT id,
          from_user_id AS fromUserId,
          to_user_id AS toUserId,
          receipt_id AS receiptId,
          receipt_meta AS receiptMeta,
          betrag, nachricht, status,
          created_at AS createdAt,
          updated_at AS updatedAt
         FROM split_requests WHERE to_user_id = ? ORDER BY created_at DESC`
      ).all(toUserId) as RawRow[];
      return rows.map(parseRow);
    },

    listOutgoing(fromUserId: string): SplitRequestRow[] {
      const rows = db.prepare(
        `SELECT id,
          from_user_id AS fromUserId,
          to_user_id AS toUserId,
          receipt_id AS receiptId,
          receipt_meta AS receiptMeta,
          betrag, nachricht, status,
          created_at AS createdAt,
          updated_at AS updatedAt
         FROM split_requests WHERE from_user_id = ? ORDER BY created_at DESC`
      ).all(fromUserId) as RawRow[];
      return rows.map(parseRow);
    },

    updateStatus(id: string, status: SplitRequestStatus): boolean {
      const result = db.prepare(
        `UPDATE split_requests SET status = ?, updated_at = ? WHERE id = ?`
      ).run(status, Date.now(), id);
      return result.changes > 0;
    },

    delete(id: string): boolean {
      const result = db.prepare("DELETE FROM split_requests WHERE id = ?").run(id);
      return result.changes > 0;
    },

    countPendingIncoming(toUserId: string): number {
      const row = db.prepare(
        `SELECT COUNT(*) AS cnt FROM split_requests WHERE to_user_id = ? AND status = 'pending'`
      ).get(toUserId) as { cnt: number };
      return row.cnt;
    },
  };
}

export type SplitRequestRepo = ReturnType<typeof createSplitRequestRepo>;

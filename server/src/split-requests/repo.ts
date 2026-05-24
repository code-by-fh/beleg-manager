import { v4 as uuidv4 } from "uuid";
import type { Db } from "../db/index.js";

export type SplitRequestStatus = "pending" | "accepted" | "rejected" | "cancelled" | "settled";

export type ReceiptMeta = {
  haendler: string;
  datum: string;
  gesamtbetrag: number;
  waehrung: string;
};

export type SplitRequestRow = {
  id: string;
  fromUserId: string;
  toUserId: string | null;
  freeName: string | null;
  receiptId: string | null;
  receiptSqliteId: string | null;
  receiptMeta: ReceiptMeta;
  betrag: number;
  nachricht: string;
  status: SplitRequestStatus;
  createdAt: number;
  updatedAt: number;
};

type RawRow = Omit<SplitRequestRow, "receiptMeta"> & { receiptMeta: string };

const SELECT_COLS = `
  id,
  from_user_id      AS fromUserId,
  to_user_id        AS toUserId,
  free_name         AS freeName,
  receipt_id        AS receiptId,
  receipt_sqlite_id AS receiptSqliteId,
  receipt_meta      AS receiptMeta,
  betrag, nachricht, status,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

function parseRow(raw: RawRow): SplitRequestRow {
  return { ...raw, receiptMeta: JSON.parse(raw.receiptMeta) as ReceiptMeta };
}

export function createSplitRequestRepo(db: Db) {
  return {
    create(input: {
      fromUserId: string;
      toUserId?: string | null;
      freeName?: string | null;
      receiptId?: string | null;
      receiptSqliteId?: string | null;
      receiptMeta: ReceiptMeta;
      betrag: number;
      nachricht: string;
    }): SplitRequestRow {
      const now = Date.now();
      const id = uuidv4();
      db.prepare(
        `INSERT INTO split_requests
          (id, from_user_id, to_user_id, free_name, receipt_id, receipt_sqlite_id,
           receipt_meta, betrag, nachricht, status, created_at, updated_at)
         VALUES (@id, @fromUserId, @toUserId, @freeName, @receiptId, @receiptSqliteId,
                 @receiptMeta, @betrag, @nachricht, 'pending', @now, @now)`
      ).run({
        id,
        fromUserId: input.fromUserId,
        toUserId: input.toUserId ?? null,
        freeName: input.freeName ?? null,
        receiptId: input.receiptId ?? null,
        receiptSqliteId: input.receiptSqliteId ?? null,
        receiptMeta: JSON.stringify(input.receiptMeta),
        betrag: input.betrag,
        nachricht: input.nachricht,
        now,
      });
      return this.getById(id)!;
    },

    getById(id: string): SplitRequestRow | undefined {
      const raw = db.prepare(`SELECT ${SELECT_COLS} FROM split_requests WHERE id = ?`).get(id) as RawRow | undefined;
      return raw ? parseRow(raw) : undefined;
    },

    listIncoming(toUserId: string): SplitRequestRow[] {
      const rows = db.prepare(
        `SELECT ${SELECT_COLS} FROM split_requests WHERE to_user_id = ? ORDER BY created_at DESC`
      ).all(toUserId) as RawRow[];
      return rows.map(parseRow);
    },

    listOutgoing(fromUserId: string): SplitRequestRow[] {
      const rows = db.prepare(
        `SELECT ${SELECT_COLS} FROM split_requests WHERE from_user_id = ? ORDER BY created_at DESC`
      ).all(fromUserId) as RawRow[];
      return rows.map(parseRow);
    },

    listKnownPersons(fromUserId: string): string[] {
      const rows = db.prepare(
        `SELECT DISTINCT free_name FROM split_requests
         WHERE from_user_id = ? AND free_name IS NOT NULL
         ORDER BY free_name`
      ).all(fromUserId) as Array<{ free_name: string }>;
      return rows.map((r) => r.free_name);
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

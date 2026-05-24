import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "../db/index.js";

export type ShareLinkRow = {
  id: string;
  token: string;
  fromUserId: string;
  personName: string;
  personEmail: string;
  createdAt: number;
  expiresAt: number;
};

const TWENTY_DAYS_MS = 20 * 24 * 60 * 60 * 1000;

const SELECT_COLS = `
  id, token,
  from_user_id  AS fromUserId,
  person_name   AS personName,
  person_email  AS personEmail,
  created_at    AS createdAt,
  expires_at    AS expiresAt
`;

function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function createShareLinkRepo(db: Db) {
  return {
    create(input: { fromUserId: string; personName: string; personEmail: string }): ShareLinkRow {
      const now = Date.now();
      const id = uuidv4();
      const token = generateToken();
      db.prepare(
        `INSERT INTO share_links (id, token, from_user_id, person_name, person_email, created_at, expires_at)
         VALUES (@id, @token, @fromUserId, @personName, @personEmail, @now, @expiresAt)`
      ).run({ id, token, fromUserId: input.fromUserId, personName: input.personName, personEmail: input.personEmail, now, expiresAt: now + TWENTY_DAYS_MS });
      return this.getById(id)!;
    },

    upsert(input: { fromUserId: string; personName: string; personEmail: string }): ShareLinkRow {
      const existing = db.prepare(
        `SELECT ${SELECT_COLS} FROM share_links WHERE from_user_id = ? AND person_email = ?`
      ).get(input.fromUserId, input.personEmail) as ShareLinkRow | undefined;

      const now = Date.now();
      const newToken = generateToken();
      const newExpiry = now + TWENTY_DAYS_MS;

      if (existing) {
        db.prepare(
          `UPDATE share_links SET token = ?, person_name = ?, created_at = ?, expires_at = ? WHERE id = ?`
        ).run(newToken, input.personName, now, newExpiry, existing.id);
        return this.getById(existing.id)!;
      }
      return this.create(input);
    },

    getByToken(token: string): ShareLinkRow | undefined {
      const rows = db.prepare(
        `SELECT ${SELECT_COLS} FROM share_links WHERE LENGTH(token) = ?`
      ).all(token.length) as ShareLinkRow[];
      for (const row of rows) {
        const a = Buffer.from(row.token);
        const b = Buffer.from(token);
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) return row;
      }
      return undefined;
    },

    getById(id: string): ShareLinkRow | undefined {
      return db.prepare(`SELECT ${SELECT_COLS} FROM share_links WHERE id = ?`).get(id) as ShareLinkRow | undefined;
    },

    listByOwner(fromUserId: string): ShareLinkRow[] {
      return db.prepare(
        `SELECT ${SELECT_COLS} FROM share_links WHERE from_user_id = ? ORDER BY created_at DESC`
      ).all(fromUserId) as ShareLinkRow[];
    },

    delete(id: string, fromUserId: string): boolean {
      const result = db.prepare(
        `DELETE FROM share_links WHERE id = ? AND from_user_id = ?`
      ).run(id, fromUserId);
      return result.changes > 0;
    },
  };
}

export type ShareLinkRepo = ReturnType<typeof createShareLinkRepo>;

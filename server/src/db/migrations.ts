import type { Db } from "./index.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  drive_root_folder_id TEXT,
  drive_inbox_folder_id TEXT,
  drive_archive_folder_id TEXT,
  sheet_id TEXT,
  refresh_token TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS gmail_processed_messages (
  message_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  processed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bank_transactions (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL,
  buchungsdatum      TEXT NOT NULL,
  betrag             REAL NOT NULL,
  haendler           TEXT NOT NULL,
  verwendungszweck   TEXT NOT NULL DEFAULT '',
  match_status       TEXT NOT NULL DEFAULT 'unmatched' CHECK (match_status IN ('unmatched', 'matched', 'ignored')),
  matched_receipt_id TEXT,
  match_confidence   TEXT CHECK (match_confidence IN ('high', 'medium', 'low', 'manual')),
  imported_at        INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_user
  ON bank_transactions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_tx_dedup
  ON bank_transactions(user_id, buchungsdatum, betrag, haendler);
CREATE INDEX IF NOT EXISTS idx_bank_tx_receipt
  ON bank_transactions(matched_receipt_id);
`;

function addColumnIfMissing(db: Db, table: string, column: string, def: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  }
}

export function runMigrations(db: Db): void {
  db.exec(SCHEMA);
  addColumnIfMissing(db, "users", "gmail_polling_enabled", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "users", "gmail_label_filter", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "users", "telegram_bot_token", "TEXT");
}

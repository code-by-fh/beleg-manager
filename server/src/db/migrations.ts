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
CREATE TABLE IF NOT EXISTS split_bank_links (
  split_id    TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  bank_tx_id  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (split_id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (bank_tx_id) REFERENCES bank_transactions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_split_bank_links_user
  ON split_bank_links(user_id);
CREATE TABLE IF NOT EXISTS failed_voice_jobs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  transcript TEXT NOT NULL,
  error      TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS receipts (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  datum            TEXT NOT NULL,
  haendler         TEXT NOT NULL,
  betrag           REAL NOT NULL,
  mwst             REAL NOT NULL DEFAULT 0,
  trinkgeld        REAL NOT NULL DEFAULT 0,
  waehrung         TEXT NOT NULL DEFAULT 'EUR',
  kategorie        TEXT NOT NULL DEFAULT '',
  zahlungsmethode  TEXT NOT NULL DEFAULT '',
  rechnungsnummer  TEXT NOT NULL DEFAULT '',
  drive_link       TEXT NOT NULL DEFAULT '',
  eingabe_typ      TEXT NOT NULL DEFAULT 'foto',
  erstellt_am      TEXT NOT NULL,
  positions        TEXT
);
CREATE INDEX IF NOT EXISTS idx_receipts_user ON receipts(user_id);
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
  addColumnIfMissing(db, "users", "receipts_view_mode", "TEXT NOT NULL DEFAULT 'table'");
  addColumnIfMissing(db, "users", "start_page", "TEXT NOT NULL DEFAULT '/'");
  addColumnIfMissing(db, "receipts", "positions", "TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS split_requests (
      id            TEXT PRIMARY KEY,
      from_user_id  TEXT NOT NULL,
      to_user_id    TEXT NOT NULL,
      receipt_id    TEXT NOT NULL,
      receipt_meta  TEXT NOT NULL,
      betrag        REAL NOT NULL,
      nachricht     TEXT NOT NULL DEFAULT '',
      status        TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','accepted','rejected','cancelled','settled')),
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL,
      FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (to_user_id)   REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_split_req_to   ON split_requests(to_user_id, status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_split_req_from ON split_requests(from_user_id, status)`);
  addColumnIfMissing(db, "split_requests", "positions", "TEXT");
  addColumnIfMissing(db, "split_requests", "adjusted_by_recipient", "INTEGER DEFAULT 0");

  // Extend split_requests: nullable to_user_id, free_name, receipt_sqlite_id, nullable receipt_id
  // Guard: only run if free_name column is absent
  const srCols = db.prepare("PRAGMA table_info(split_requests)").all() as Array<{ name: string }>;
  if (!srCols.some((c) => c.name === "free_name")) {
    db.exec(`
      CREATE TABLE split_requests_new (
        id                TEXT PRIMARY KEY,
        from_user_id      TEXT NOT NULL,
        to_user_id        TEXT,
        free_name         TEXT,
        receipt_id        TEXT,
        receipt_sqlite_id TEXT,
        receipt_meta      TEXT NOT NULL,
        betrag            REAL NOT NULL,
        nachricht         TEXT NOT NULL DEFAULT '',
        status            TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','accepted','rejected','cancelled','settled')),
        created_at        INTEGER NOT NULL,
        updated_at        INTEGER NOT NULL,
        FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (to_user_id)   REFERENCES users(id) ON DELETE CASCADE
      );
      INSERT INTO split_requests_new
        (id, from_user_id, to_user_id, free_name, receipt_id, receipt_sqlite_id,
         receipt_meta, betrag, nachricht, status, created_at, updated_at)
      SELECT id, from_user_id, to_user_id, NULL, receipt_id, NULL,
             receipt_meta, betrag, nachricht, status, created_at, updated_at
      FROM split_requests;
      DROP TABLE split_requests;
      ALTER TABLE split_requests_new RENAME TO split_requests;
      CREATE INDEX IF NOT EXISTS idx_split_req_to   ON split_requests(to_user_id, status);
      CREATE INDEX IF NOT EXISTS idx_split_req_from ON split_requests(from_user_id, status);
    `);
  }

  // Recreate split_requests to allow 'settled' in the CHECK constraint for existing dbs
  const srSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'split_requests'").get() as { sql: string } | undefined;
  if (srSql && !srSql.sql.includes("'settled'")) {
    db.exec(`
      CREATE TABLE split_requests_new (
        id                TEXT PRIMARY KEY,
        from_user_id      TEXT NOT NULL,
        to_user_id        TEXT,
        free_name         TEXT,
        receipt_id        TEXT,
        receipt_sqlite_id TEXT,
        receipt_meta      TEXT NOT NULL,
        betrag            REAL NOT NULL,
        nachricht         TEXT NOT NULL DEFAULT '',
        status            TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','accepted','rejected','cancelled','settled')),
        created_at        INTEGER NOT NULL,
        updated_at        INTEGER NOT NULL,
        FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (to_user_id)   REFERENCES users(id) ON DELETE CASCADE
      );
      INSERT INTO split_requests_new
        (id, from_user_id, to_user_id, free_name, receipt_id, receipt_sqlite_id,
         receipt_meta, betrag, nachricht, status, created_at, updated_at)
      SELECT id, from_user_id, to_user_id, free_name, receipt_id, receipt_sqlite_id,
             receipt_meta, betrag, nachricht, status, created_at, updated_at
      FROM split_requests;
      DROP TABLE split_requests;
      ALTER TABLE split_requests_new RENAME TO split_requests;
      CREATE INDEX IF NOT EXISTS idx_split_req_to   ON split_requests(to_user_id, status);
      CREATE INDEX IF NOT EXISTS idx_split_req_from ON split_requests(from_user_id, status);
    `);
  }

  // failed_uploads: for direct-upload receipts where Gemini failed
  db.exec(`
    CREATE TABLE IF NOT EXISTS failed_uploads (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      filename    TEXT NOT NULL,
      filepath    TEXT NOT NULL,
      error       TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS service_health (
      service_name    TEXT PRIMARY KEY,
      last_run_at     INTEGER NOT NULL,
      status          TEXT NOT NULL DEFAULT 'unknown'
                        CHECK (status IN ('ok', 'error', 'unknown')),
      items_processed INTEGER NOT NULL DEFAULT 0,
      items_failed    INTEGER NOT NULL DEFAULT 0,
      last_error      TEXT,
      updated_at      INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS share_links (
      id           TEXT PRIMARY KEY,
      token        TEXT NOT NULL UNIQUE,
      from_user_id TEXT NOT NULL,
      person_name  TEXT NOT NULL,
      person_email TEXT NOT NULL,
      created_at   INTEGER NOT NULL,
      expires_at   INTEGER NOT NULL,
      FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_share_links_owner ON share_links(from_user_id, person_email)`);
}

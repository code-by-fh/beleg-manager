import type { Db } from "../db/index.js";

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
  positions?: Array<{ name: string; amount: number }> | null;
};

type DbReceiptRow = {
  id: string;
  user_id: string;
  datum: string;
  haendler: string;
  betrag: number;
  mwst: number;
  trinkgeld: number;
  waehrung: string;
  kategorie: string;
  zahlungsmethode: string;
  rechnungsnummer: string;
  drive_link: string;
  eingabe_typ: string;
  erstellt_am: string;
  positions: string | null;
};

function fromDb(r: DbReceiptRow): ReceiptRow {
  return {
    id: r.id,
    datum: r.datum,
    haendler: r.haendler,
    betrag: r.betrag,
    mwst: r.mwst,
    trinkgeld: r.trinkgeld,
    waehrung: r.waehrung,
    kategorie: r.kategorie,
    zahlungsmethode: r.zahlungsmethode,
    rechnungsnummer: r.rechnungsnummer,
    driveLink: r.drive_link,
    eingabeTyp: r.eingabe_typ as ReceiptRow["eingabeTyp"],
    erstelltAm: r.erstellt_am,
    positions: r.positions ? JSON.parse(r.positions) : null,
  };
}

export function createReceiptRepo(db: Db) {
  const insertStmt = db.prepare<[
    string, string, string, string, number, number, number,
    string, string, string, string, string, string, string, string | null
  ]>(`
    INSERT INTO receipts
      (id, user_id, datum, haendler, betrag, mwst, trinkgeld,
       waehrung, kategorie, zahlungsmethode, rechnungsnummer,
       drive_link, eingabe_typ, erstellt_am, positions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const findAllStmt = db.prepare<[string]>(
    `SELECT * FROM receipts WHERE user_id = ? ORDER BY datum DESC, erstellt_am DESC`
  );

  const findByIdStmt = db.prepare<[string, string]>(
    `SELECT * FROM receipts WHERE user_id = ? AND id = ?`
  );

  const deleteStmt = db.prepare<[string, string]>(
    `DELETE FROM receipts WHERE user_id = ? AND id = ?`
  );

  const updateStmt = db.prepare<[
    string, string, number, number, number, string, string, string, string, string, string, string, string | null, string, string
  ]>(`
    UPDATE receipts SET
      datum = ?, haendler = ?, betrag = ?, mwst = ?, trinkgeld = ?,
      waehrung = ?, kategorie = ?, zahlungsmethode = ?, rechnungsnummer = ?,
      drive_link = ?, eingabe_typ = ?, erstellt_am = ?, positions = ?
    WHERE user_id = ? AND id = ?
  `);

  const checkDuplicateStmt = db.prepare<[string, string, number, string]>(`
    SELECT 1 FROM receipts
    WHERE user_id = ?
      AND LOWER(haendler) = LOWER(?)
      AND betrag = ?
      AND ABS(JULIANDAY(datum) - JULIANDAY(?)) <= 1
    LIMIT 1
  `);

  return {
    insert(userId: string, row: ReceiptRow): void {
      insertStmt.run(
        row.id, userId, row.datum, row.haendler, row.betrag, row.mwst, row.trinkgeld,
        row.waehrung, row.kategorie, row.zahlungsmethode, row.rechnungsnummer,
        row.driveLink, row.eingabeTyp, row.erstelltAm,
        row.positions ? JSON.stringify(row.positions) : null
      );
    },

    findAll(userId: string): ReceiptRow[] {
      return (findAllStmt.all(userId) as DbReceiptRow[]).map(fromDb);
    },

    findById(userId: string, id: string): ReceiptRow | undefined {
      const row = findByIdStmt.get(userId, id) as DbReceiptRow | undefined;
      return row ? fromDb(row) : undefined;
    },

    update(userId: string, row: ReceiptRow): boolean {
      const result = updateStmt.run(
        row.datum, row.haendler, row.betrag, row.mwst, row.trinkgeld,
        row.waehrung, row.kategorie, row.zahlungsmethode, row.rechnungsnummer,
        row.driveLink, row.eingabeTyp, row.erstelltAm,
        row.positions ? JSON.stringify(row.positions) : null,
        userId, row.id
      );
      return result.changes > 0;
    },

    delete(userId: string, id: string): boolean {
      const result = deleteStmt.run(userId, id);
      return result.changes > 0;
    },

    checkDuplicate(userId: string, datum: string, haendler: string, betrag: number): boolean {
      const row = checkDuplicateStmt.get(userId, haendler, betrag, datum);
      return row !== undefined;
    },
  };
}

export type ReceiptRepo = ReturnType<typeof createReceiptRepo>;

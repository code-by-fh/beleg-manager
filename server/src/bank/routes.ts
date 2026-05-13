import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { Db } from "../db/index.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { buildOAuth2ClientFromSession } from "../google/client.js";
import { sheetsFor, readAllRows } from "../google/sheets.js";
import { parseIngCsv } from "./csvParser.js";
import { matchTransactions, type ReceiptForMatching } from "./matcher.js";
import { createTransactionRepo } from "./transactionRepo.js";

export type BankDeps = {
  config: Config;
  userRepo: UserRepo;
  db: Db;
};

const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      ["text/csv", "text/plain", "application/csv", "application/vnd.ms-excel"].includes(file.mimetype) ||
      file.originalname.toLowerCase().endsWith(".csv");
    if (ok) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files allowed"));
    }
  },
}).single("file");

const MatchBody = z.object({
  transactionId: z.string().min(1),
  receiptId: z.string().nullable(),
});

const IgnoreBody = z.object({
  transactionId: z.string().min(1),
});

export function buildBankRouter(deps: BankDeps): Router {
  const txRepo = createTransactionRepo(deps.db);
  const router = Router();
  router.use(requireAuth);

  // POST /api/bank/import
  router.post("/import", uploadCsv, async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "file required" });

      const csvText = req.file.buffer.toString("utf-8").replace(/^﻿/, "");
      const { transactions, errors: parseErrors } = parseIngCsv(csvText);

      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);

      let receipts: ReceiptForMatching[] = [];
      if (user?.sheetId) {
        const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
        const sheets = sheetsFor(auth);
        const allRows = await readAllRows(sheets, user.sheetId);
        receipts = allRows.map((r) => ({
          id: r.id,
          datum: r.datum,
          haendler: r.haendler,
          betrag: r.betrag,
        }));
      }

      const matchResults = matchTransactions(transactions, receipts);

      const rows = transactions.map((tx, i) => {
        const matchResult = matchResults[i];
        const isMatched = matchResult?.confidence != null;
        return {
          id: uuidv4(),
          buchungsdatum: tx.buchungsdatum,
          betrag: tx.betrag,
          haendler: tx.haendler,
          verwendungszweck: tx.verwendungszweck,
          matchStatus: (isMatched ? "matched" : "unmatched") as "matched" | "unmatched",
          matchedReceiptId: matchResult?.matchedReceiptId ?? null,
          matchConfidence: matchResult?.confidence ?? null,
        };
      });

      txRepo.insertMany(userId, rows);

      const autoMatched = rows.filter((r) => r.matchStatus === "matched").length;
      const unmatched = rows.filter((r) => r.matchStatus === "unmatched").length;

      res.json({
        imported: rows.length,
        autoMatched,
        unmatched,
        parseErrors,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/bank/transactions
  router.get("/transactions", (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const transactions = txRepo.listByUser(userId);
      res.json({ transactions });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/bank/match
  router.post("/match", async (req, res, next) => {
    try {
      const parsed = MatchBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });

      const userId = req.session.userId!;
      const { transactionId, receiptId } = parsed.data;

      txRepo.updateMatch(transactionId, userId, receiptId, "manual");
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) {
        return res.status(404).json({ error: err.message });
      }
      next(err);
    }
  });

  // POST /api/bank/ignore
  router.post("/ignore", (req, res, next) => {
    try {
      const parsed = IgnoreBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });

      const userId = req.session.userId!;
      txRepo.updateStatus(parsed.data.transactionId, userId, "ignored");
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) {
        return res.status(404).json({ error: err.message });
      }
      next(err);
    }
  });

  // DELETE /api/bank/transactions
  router.delete("/transactions", (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const deleted = txRepo.clearByUser(userId);
      res.json({ ok: true, deleted });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

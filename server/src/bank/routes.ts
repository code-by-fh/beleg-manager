import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { Db } from "../db/index.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { buildOAuth2ClientFromSession } from "../google/client.js";
import { sheetsFor, readAllRows, readSplits } from "../google/sheets.js";
import { parseIngCsv } from "./csvParser.js";
import { matchTransactions, type ReceiptForMatching } from "./matcher.js";
import { createTransactionRepo, NotFoundError } from "./transactionRepo.js";

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

// Fix 5: use z.string().min(1) so empty strings are rejected
const MatchBody = z.object({
  transactionId: z.string().min(1),
  receiptId: z.string().min(1).nullable(),
});

const IgnoreBody = z.object({
  transactionId: z.string().min(1),
});

export function buildBankRouter(deps: BankDeps): Router {
  const txRepo = createTransactionRepo(deps.db);
  const router = Router();
  router.use(requireAuth);

  // POST /api/bank/import
  // Fix 2: catch multer errors and return 400 instead of 500
  router.post(
    "/import",
    (req, res, next) => {
      uploadCsv(req, res, (err: unknown) => {
        if (err) return res.status(400).json({ error: err instanceof Error ? err.message : "Upload error" });
        next();
      });
    },
    async (req, res, next) => {
      try {
        if (!req.file) return res.status(400).json({ error: "file required" });

        // ING CSV is Windows-1252 encoded. Detect UTF-8 BOM; otherwise use latin1.
        const buf = req.file.buffer;
        const csvText =
          buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
            ? buf.slice(3).toString("utf-8")
            : buf.toString("latin1");
        const { transactions, errors: parseErrors } = parseIngCsv(csvText);

        const userId = req.session.userId!;
        const user = deps.userRepo.getById(userId);

        // Fix 4: wrap Sheets fetch in try/catch so import doesn't abort on Sheets error
        let receipts: ReceiptForMatching[] = [];
        if (user?.sheetId) {
          try {
            const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
            const sheets = sheetsFor(auth);
            const rows = await readAllRows(sheets, user.sheetId);
            receipts = rows.map((r) => ({
              id: r.id,
              datum: r.datum,
              haendler: r.haendler,
              betrag: r.betrag,
            }));
          } catch {
            console.warn("[bank/import] Could not fetch receipts from Sheets, skipping auto-match");
          }
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

        // Auto-link positive transactions (incoming payments) to open splits
        let splitAutoLinked = 0;
        if (user?.sheetId) {
          try {
            const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
            const sheets = sheetsFor(auth);
            const splits = await readSplits(sheets, user.sheetId);
            const existingLinks = deps.db
              .prepare("SELECT split_id FROM split_bank_links WHERE user_id = ?")
              .all(userId) as Array<{ split_id: string }>;
            const linkedSplitIds = new Set(existingLinks.map((r) => r.split_id));
            const openSplits = splits.filter((s) => !s.beglichen && !linkedSplitIds.has(s.splitId));

            // All positive user transactions (incoming payments = possible repayments)
            const allPositiveTxs = txRepo
              .listByUser(userId)
              .filter((t) => t.betrag > 0 && t.matchStatus !== "ignored");

            const usedTxIds = new Set<string>();
            const insertLink = deps.db.prepare(
              "INSERT OR IGNORE INTO split_bank_links (split_id, user_id, bank_tx_id, created_at) VALUES (?, ?, ?, ?)"
            );
            for (const split of openSplits) {
              const match = allPositiveTxs.find(
                (tx) =>
                  !usedTxIds.has(tx.id) &&
                  Math.round(Math.abs(tx.betrag) * 100) === Math.round(split.betrag * 100)
              );
              if (match) {
                insertLink.run(split.splitId, userId, match.id, Date.now());
                usedTxIds.add(match.id);
                splitAutoLinked++;
              }
            }
          } catch {
            // Don't block import if split matching fails
          }
        }

        const autoMatched = rows.filter((r) => r.matchStatus === "matched").length;
        const unmatched = rows.filter((r) => r.matchStatus === "unmatched").length;

        res.json({
          imported: rows.length,
          autoMatched,
          unmatched,
          splitAutoLinked,
          parseErrors,
        });
      } catch (err) {
        next(err);
      }
    }
  );

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

      // Fix 1: verify receipt ownership before updating the match
      if (receiptId !== null) {
        const user = deps.userRepo.getById(userId);
        if (!user?.sheetId) {
          return res.status(400).json({ error: "No Google Sheet configured for this user" });
        }
        const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
        const sheets = sheetsFor(auth);
        const allRows = await readAllRows(sheets, user.sheetId);
        const exists = allRows.some((r) => r.id === receiptId);
        if (!exists) {
          return res.status(404).json({ error: `Receipt ${receiptId} not found` });
        }
      }

      txRepo.updateMatch(transactionId, userId, receiptId, "manual");
      res.json({ ok: true });
    } catch (err) {
      // Fix 3: use typed NotFoundError instead of string matching
      if (err instanceof NotFoundError) {
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
      // Fix 3: use typed NotFoundError instead of string matching
      if (err instanceof NotFoundError) {
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

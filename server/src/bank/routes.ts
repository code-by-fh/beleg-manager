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

      // When a receipt-bank-tx link changes, remove stale split-bank-tx manual links
      // so splits of the (now de-linked) receipt don't show a phantom bank-tx connection.
      deps.db
        .prepare("DELETE FROM split_bank_links WHERE bank_tx_id = ? AND user_id = ?")
        .run(transactionId, userId);

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

  // POST /api/bank/auto-match
  // Re-runs the matching algorithm on all currently unmatched outgoing transactions.
  router.post("/auto-match", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.sheetId) return res.json({ matched: 0 });

      const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
      const sheets = sheetsFor(auth);
      const allRows = await readAllRows(sheets, user.sheetId);

      // Exclude receipts already claimed by a matched transaction
      const alreadyMatchedReceiptIds = new Set(
        txRepo.listByUser(userId)
          .filter((tx) => tx.matchStatus === "matched" && tx.matchedReceiptId)
          .map((tx) => tx.matchedReceiptId!)
      );

      const receipts: ReceiptForMatching[] = allRows
        .filter((r) => !alreadyMatchedReceiptIds.has(r.id))
        .map((r) => ({ id: r.id, datum: r.datum, haendler: r.haendler, betrag: r.betrag }));

      const unmatchedTxs = txRepo.listUnmatched(userId);

      if (unmatchedTxs.length === 0 || receipts.length === 0) {
        return res.json({ matched: 0 });
      }

      const matchResults = matchTransactions(unmatchedTxs, receipts);

      let matched = 0;
      for (let i = 0; i < matchResults.length; i++) {
        const result = matchResults[i];
        const tx = unmatchedTxs[i];
        if (result?.confidence != null && result.matchedReceiptId && tx) {
          txRepo.updateMatch(tx.id, userId, result.matchedReceiptId, result.confidence);
          matched++;
        }
      }

      res.json({ matched });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/bank/auto-match-splits
  // Matches positive bank transactions (incoming payments) to unlinked splits by exact amount
  // and date (payment must arrive within 60 days after the receipt date).
  router.post("/auto-match-splits", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.sheetId) return res.json({ matched: 0 });

      const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
      const sheets = sheetsFor(auth);
      const splits = await readSplits(sheets, user.sheetId);

      // Split IDs already linked manually and the bank tx IDs they reference
      const existingLinks = deps.db
        .prepare("SELECT split_id, bank_tx_id FROM split_bank_links WHERE user_id = ?")
        .all(userId) as Array<{ split_id: string; bank_tx_id: string }>;
      const linkedSplitIds = new Set(existingLinks.map((l) => l.split_id));
      // Pre-seed used tx IDs so the same incoming payment isn't assigned to two splits
      const usedTxIds = new Set(existingLinks.map((l) => l.bank_tx_id));

      // Only exclude splits that already have a manual repayment link.
      // A receipt-derived link (the outgoing payment to the merchant) does NOT mean the
      // repayment from the split participant has been matched — that's a separate event.
      const unmatchedSplits = splits.filter((s) => !linkedSplitIds.has(s.splitId));

      if (unmatchedSplits.length === 0) return res.json({ matched: 0 });

      const positiveTxs = txRepo.listByUser(userId).filter(
        (tx) => tx.betrag > 0 && tx.matchStatus !== "ignored"
      );

      if (positiveTxs.length === 0) return res.json({ matched: 0 });
      let matched = 0;

      // Sort splits descending by amount so higher-value splits get priority
      const sortedSplits = [...unmatchedSplits].sort((a, b) => b.betrag - a.betrag);

      for (const split of sortedSplits) {
        const splitCents = Math.round(split.betrag * 100);
        const splitDays = Math.floor(new Date(split.datum).getTime() / 86_400_000);

        const matchingTx = positiveTxs.find((tx) => {
          if (usedTxIds.has(tx.id)) return false;
          if (Math.round(tx.betrag * 100) !== splitCents) return false;
          const txDays = Math.floor(new Date(tx.buchungsdatum).getTime() / 86_400_000);
          const diff = txDays - splitDays;
          return diff >= 0 && diff <= 60;
        });

        if (matchingTx) {
          deps.db
            .prepare(
              "INSERT OR IGNORE INTO split_bank_links (split_id, user_id, bank_tx_id, created_at) VALUES (?, ?, ?, ?)"
            )
            .run(split.splitId, userId, matchingTx.id, Date.now());
          usedTxIds.add(matchingTx.id);
          matched++;
        }
      }

      res.json({ matched });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/bank/transactions
  router.delete("/transactions", (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const deleted = txRepo.deleteByRange(userId, "1970-01-01", "9999-12-31");
      res.json({ ok: true, deleted });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

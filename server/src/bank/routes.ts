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
      ["text/csv", "text/plain", "application/csv", "application/vnd.ms-excel"].includes(
        file.mimetype
      ) || file.originalname.toLowerCase().endsWith(".csv");
    if (ok) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files allowed"));
    }
  },
}).single("file");

const MatchBody = z.object({
  transactionId: z.string().min(1),
  receiptId: z.string().min(1).nullable(),
});

const IgnoreBody = z.object({
  transactionId: z.string().min(1),
});

const DateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const FilterQuery = z.object({
  from: DateParam.optional(),
  to: DateParam.optional(),
});

const RangeDeleteQuery = z.object({
  from: DateParam,
  to: DateParam,
});

export function buildBankRouter(deps: BankDeps): Router {
  const txRepo = createTransactionRepo(deps.db);
  const router = Router();
  router.use(requireAuth);

  // Matches pending split_requests against positive bank transactions by amount + date window.
  // Returns the number of new links created.
  function autoMatchSplitsForUser(userId: string): number {
    const existingLinks = deps.db
      .prepare("SELECT split_id, bank_tx_id FROM split_bank_links WHERE user_id = ?")
      .all(userId) as Array<{ split_id: string; bank_tx_id: string }>;
    const usedTxIds = new Set(existingLinks.map((l) => l.bank_tx_id));
    const linkedSplitIds = new Set(existingLinks.map((l) => l.split_id));

    const unlinkedSplits = deps.db
      .prepare(
        `SELECT id, betrag, created_at FROM split_requests
         WHERE from_user_id = ? AND status IN ('pending', 'accepted')`
      )
      .all(userId) as Array<{ id: string; betrag: number; created_at: number }>;

    const candidates = unlinkedSplits.filter((s) => !linkedSplitIds.has(s.id));
    if (candidates.length === 0) return 0;

    const positiveTxs = txRepo
      .listByUser(userId)
      .filter((tx) => tx.betrag > 0 && tx.matchStatus !== "ignored");
    if (positiveTxs.length === 0) return 0;

    // Process largest splits first to avoid ambiguous matches
    candidates.sort((a, b) => b.betrag - a.betrag);

    const insertLink = deps.db.prepare(
      "INSERT OR IGNORE INTO split_bank_links (split_id, user_id, bank_tx_id, created_at) VALUES (?, ?, ?, ?)"
    );
    let matched = 0;
    const now = Date.now();

    for (const split of candidates) {
      const splitCents = Math.round(split.betrag * 100);
      const splitDays = Math.floor(split.created_at / 86_400_000);

      const matchingTx = positiveTxs.find((tx) => {
        if (usedTxIds.has(tx.id)) return false;
        if (Math.round(tx.betrag * 100) !== splitCents) return false;
        const txDays = Math.floor(new Date(tx.buchungsdatum).getTime() / 86_400_000);
        const diff = txDays - splitDays;
        return diff >= 0 && diff <= 60;
      });

      if (matchingTx) {
        insertLink.run(split.id, userId, matchingTx.id, now);
        usedTxIds.add(matchingTx.id);
        matched++;
      }
    }

    return matched;
  }

  // GET /api/bank/transactions?from=YYYY-MM-DD&to=YYYY-MM-DD
  router.get("/transactions", (req, res, next) => {
    try {
      const parsed = FilterQuery.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: "invalid query", details: parsed.error.flatten() });
      }
      const userId = req.session.userId!;
      const transactions = txRepo.listByUser(userId, parsed.data);
      res.json({ transactions });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/bank/import
  router.post(
    "/import",
    (req, res, next) => {
      uploadCsv(req, res, (err: unknown) => {
        if (err)
          return res.status(400).json({ error: err instanceof Error ? err.message : "Upload error" });
        next();
      });
    },
    async (req, res, next) => {
      try {
        if (!req.file) return res.status(400).json({ error: "file required" });

        const buf = req.file.buffer;
        const csvText =
          buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
            ? buf.slice(3).toString("utf-8")
            : buf.toString("latin1");
        const { transactions: allParsed, errors: parseErrors } = parseIngCsv(csvText);

        const userId = req.session.userId!;

        // App-layer dedup check against existing DB rows
        const existingKeys = txRepo.getDeduplicateKeys(userId);
        const newTransactions: typeof allParsed = [];
        const duplicates: Array<{ buchungsdatum: string; haendler: string; betrag: number }> = [];

        for (const tx of allParsed) {
          const key = `${tx.buchungsdatum}|${tx.betrag}|${tx.haendler}`;
          if (existingKeys.has(key)) {
            duplicates.push({
              buchungsdatum: tx.buchungsdatum,
              haendler: tx.haendler,
              betrag: tx.betrag,
            });
          } else {
            newTransactions.push(tx);
          }
        }

        // Auto-match only new transactions
        const user = deps.userRepo.getById(userId);
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
            // Non-fatal — import continues without auto-match
          }
        }

        const matchResults = matchTransactions(newTransactions, receipts);

        const rows = newTransactions.map((tx, i) => {
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

        // Also auto-match incoming positive transactions against open split requests
        const splitMatched = autoMatchSplitsForUser(userId);

        res.json({
          imported: rows.length,
          autoMatched,
          unmatched,
          splitMatched,
          parseErrors,
          duplicates,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/bank/match
  router.post("/match", async (req, res, next) => {
    try {
      const parsed = MatchBody.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });

      const userId = req.session.userId!;
      const { transactionId, receiptId } = parsed.data;

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

      deps.db
        .prepare("DELETE FROM split_bank_links WHERE bank_tx_id = ? AND user_id = ?")
        .run(transactionId, userId);

      res.json({ ok: true });
    } catch (err) {
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
      if (!parsed.success)
        return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });

      const userId = req.session.userId!;
      txRepo.updateStatus(parsed.data.transactionId, userId, "ignored");
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return res.status(404).json({ error: err.message });
      }
      next(err);
    }
  });

  // POST /api/bank/auto-match
  router.post("/auto-match", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.sheetId) return res.json({ matched: 0 });

      const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
      const sheets = sheetsFor(auth);
      const allRows = await readAllRows(sheets, user.sheetId);

      const alreadyMatchedReceiptIds = new Set(
        txRepo
          .listByUser(userId)
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
  router.post("/auto-match-splits", (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const matched = autoMatchSplitsForUser(userId);
      res.json({ matched });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/bank/transactions/:id  — single transaction
  router.delete("/transactions/:id", (req, res, next) => {
    try {
      const userId = req.session.userId!;
      txRepo.deleteById(req.params.id, userId);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return res.status(404).json({ error: err.message });
      }
      next(err);
    }
  });

  // DELETE /api/bank/transactions?from=YYYY-MM-DD&to=YYYY-MM-DD  — range delete
  router.delete("/transactions", (req, res, next) => {
    try {
      const parsed = RangeDeleteQuery.safeParse(req.query);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "from and to (YYYY-MM-DD) are required", details: parsed.error.flatten() });
      }
      const userId = req.session.userId!;
      const { from, to } = parsed.data;
      if (from > to) {
        return res.status(400).json({ error: "'from' must be <= 'to'" });
      }
      const deleted = txRepo.deleteByRange(userId, from, to);
      res.json({ ok: true, deleted });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

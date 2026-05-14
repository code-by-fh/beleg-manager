import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { requireAuth } from "../middleware/requireAuth.js";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { Db } from "../db/index.js";
import { buildOAuth2ClientFromSession } from "../google/client.js";
import { sheetsFor, readSplits, appendSplit, updateSplitBeglichen, deleteSplitRow } from "../google/sheets.js";

const CreateSplitsBody = z.object({
  receiptId: z.string().min(1),
  haendler: z.string().min(1),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gesamtbetrag: z.number().positive(),
  waehrung: z.string().default("EUR"),
  items: z.array(z.object({ person: z.string().min(1), betrag: z.number().positive() })).min(1),
});

const LinkBankTxBody = z.object({
  bankTxId: z.string().min(1).nullable(),
});

export function buildSplitsRouter(config: Config, userRepo: UserRepo, db: Db) {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const user = userRepo.getById(userId);
      if (!user?.sheetId) return res.json({ splits: [] });
      const auth = buildOAuth2ClientFromSession(config.google, req.session);
      const sheets = sheetsFor(auth);
      const splits = await readSplits(sheets, user.sheetId);

      // Enrich with linked bank tx from SQLite
      const links = db
        .prepare("SELECT split_id, bank_tx_id FROM split_bank_links WHERE user_id = ?")
        .all(userId) as Array<{ split_id: string; bank_tx_id: string }>;
      const linkMap = new Map(links.map((l) => [l.split_id, l.bank_tx_id]));

      const enriched = splits.map((s) => ({
        ...s,
        linkedBankTxId: linkMap.get(s.splitId) ?? null,
      }));

      res.json({ splits: enriched });
    } catch (err) {
      next(err);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const parsed = CreateSplitsBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });

      const user = userRepo.getById(req.session.userId!);
      if (!user?.sheetId) return res.status(409).json({ error: "user drive not bootstrapped" });

      const auth = buildOAuth2ClientFromSession(config.google, req.session);
      const sheets = sheetsFor(auth);

      const now = new Date().toISOString();
      const rows = parsed.data.items.map((item) => ({
        splitId: uuidv4(),
        receiptId: parsed.data.receiptId,
        haendler: parsed.data.haendler,
        datum: parsed.data.datum,
        gesamtbetrag: parsed.data.gesamtbetrag,
        waehrung: parsed.data.waehrung,
        person: item.person,
        betrag: item.betrag,
        beglichen: false,
        erstelltAm: now,
      }));

      await Promise.all(rows.map((row) => appendSplit(sheets, user.sheetId!, row)));

      res.json({ ok: true, splits: rows });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:id/beglichen", async (req, res, next) => {
    try {
      const { beglichen } = z.object({ beglichen: z.boolean() }).parse(req.body);
      const user = userRepo.getById(req.session.userId!);
      if (!user?.sheetId) return res.status(409).json({ error: "user drive not bootstrapped" });

      const auth = buildOAuth2ClientFromSession(config.google, req.session);
      const sheets = sheetsFor(auth);
      const ok = await updateSplitBeglichen(sheets, user.sheetId, req.params.id, beglichen);
      if (!ok) return res.status(404).json({ error: "split not found" });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Link or unlink a bank transaction to a split (bankTxId: null = unlink)
  router.patch("/:id/bank-tx", (req, res, next) => {
    try {
      const parsed = LinkBankTxBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid body" });

      const userId = req.session.userId!;
      const splitId = req.params.id;
      const { bankTxId } = parsed.data;

      if (bankTxId === null) {
        db.prepare("DELETE FROM split_bank_links WHERE split_id = ? AND user_id = ?").run(splitId, userId);
      } else {
        db.prepare(
          "INSERT OR REPLACE INTO split_bank_links (split_id, user_id, bank_tx_id, created_at) VALUES (?, ?, ?, ?)"
        ).run(splitId, userId, bankTxId, Date.now());
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const user = userRepo.getById(userId);
      if (!user?.sheetId) return res.status(409).json({ error: "user drive not bootstrapped" });

      const auth = buildOAuth2ClientFromSession(config.google, req.session);
      const sheets = sheetsFor(auth);
      const ok = await deleteSplitRow(sheets, user.sheetId, req.params.id);
      if (!ok) return res.status(404).json({ error: "split not found" });

      // Clean up any bank tx link
      db.prepare("DELETE FROM split_bank_links WHERE split_id = ? AND user_id = ?").run(req.params.id, userId);

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

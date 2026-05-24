import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import type { Db } from "../db/index.js";

const LinkBankTxBody = z.object({
  bankTxId: z.string().min(1).nullable(),
});

export function buildSplitsRouter(db: Db) {
  const router = Router();
  router.use(requireAuth);

  router.patch("/:id/bank-tx", (req, res, next) => {
    try {
      const parsed = LinkBankTxBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid body" });

      const userId = req.session.userId!;
      const splitId = req.params.id;
      const { bankTxId } = parsed.data;

      if (bankTxId === null) {
        const existingLink = db
          .prepare("SELECT bank_tx_id FROM split_bank_links WHERE split_id = ? AND user_id = ?")
          .get(splitId, userId) as { bank_tx_id: string } | undefined;
        db.prepare("DELETE FROM split_bank_links WHERE split_id = ? AND user_id = ?").run(splitId, userId);
        if (existingLink) {
          db.prepare(
            "UPDATE bank_transactions SET match_status = 'unmatched', match_confidence = NULL WHERE id = ? AND user_id = ? AND matched_receipt_id IS NULL"
          ).run(existingLink.bank_tx_id, userId);
        }
      } else {
        const tx = db
          .prepare("SELECT betrag FROM bank_transactions WHERE id = ? AND user_id = ?")
          .get(bankTxId, userId) as { betrag: number } | undefined;
        if (!tx) return res.status(404).json({ error: "bank transaction not found" });
        if (tx.betrag <= 0) return res.status(400).json({ error: "only positive incoming payments can be linked to a split" });
        db.prepare(
          "INSERT OR REPLACE INTO split_bank_links (split_id, user_id, bank_tx_id, created_at) VALUES (?, ?, ?, ?)"
        ).run(splitId, userId, bankTxId, Date.now());
        db.prepare(
          "UPDATE bank_transactions SET match_status = 'matched', match_confidence = 'manual' WHERE id = ? AND user_id = ?"
        ).run(bankTxId, userId);
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

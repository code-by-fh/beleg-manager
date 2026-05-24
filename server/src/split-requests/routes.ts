import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/requireAuth.js";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { Db } from "../db/index.js";
import type { SplitRequestRepo } from "./repo.js";
import { CreateSplitRequestBody, UpdateStatusBody, LinkBankTxBody } from "./schema.js";
import { driveFor } from "../google/drive.js";
import { buildOAuth2ClientForRefreshToken } from "../google/client.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "split-requests" });

const createLimit = rateLimit({
  windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => (req.session?.userId ?? req.ip) as string,
});

const previewLimit = rateLimit({
  windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => (req.session?.userId ?? req.ip) as string,
});

export function buildSplitRequestsRouter(
  config: Config,
  userRepo: UserRepo,
  splitRequestRepo: SplitRequestRepo,
  db: Db,
) {
  const router = Router();
  router.use(requireAuth);

  router.get("/incoming", (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const requests = splitRequestRepo.listIncoming(userId);
      const bankLinks = db
        .prepare("SELECT split_id, bank_tx_id FROM split_bank_links WHERE user_id = ?")
        .all(userId) as Array<{ split_id: string; bank_tx_id: string }>;
      const linkMap = new Map(bankLinks.map((l) => [l.split_id, l.bank_tx_id]));
      const enriched = requests.map((r) => ({
        ...r,
        fromUser: (() => {
          const u = userRepo.getById(r.fromUserId);
          return u ? { id: u.id, name: u.name, email: u.email } : null;
        })(),
        linkedBankTxId: linkMap.get(r.id) ?? null,
        linkedBankTxSource: linkMap.has(r.id) ? ("manual" as const) : null,
      }));
      res.json({ requests: enriched });
    } catch (err) { next(err); }
  });

  router.get("/outgoing", (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const requests = splitRequestRepo.listOutgoing(userId);

      // 1. Manual links (via SplitBankTxDialog)
      const bankLinks = db
        .prepare("SELECT split_id, bank_tx_id FROM split_bank_links WHERE user_id = ?")
        .all(userId) as Array<{ split_id: string; bank_tx_id: string }>;
      const manualLinkMap = new Map(bankLinks.map((l) => [l.split_id, l.bank_tx_id]));

      // 2. Implicit links: receipt matched in Kontoabgleich → split of that receipt is settled
      const receiptIds = requests
        .map((r) => r.receiptSqliteId)
        .filter((id): id is string => id !== null);
      const receiptTxMap = new Map<string, string>(); // receiptSqliteId → bankTxId
      if (receiptIds.length > 0) {
        const placeholders = receiptIds.map(() => "?").join(",");
        (db
          .prepare(
            `SELECT matched_receipt_id, id FROM bank_transactions
             WHERE user_id = ? AND match_status = 'matched'
               AND matched_receipt_id IN (${placeholders})`
          )
          .all(userId, ...receiptIds) as Array<{ matched_receipt_id: string; id: string }>)
          .forEach((row) => receiptTxMap.set(row.matched_receipt_id, row.id));
      }

      const enriched = requests.map((r) => {
        const manualTxId = manualLinkMap.get(r.id) ?? null;
        const receiptTxId = r.receiptSqliteId ? (receiptTxMap.get(r.receiptSqliteId) ?? null) : null;
        const linkedBankTxId = manualTxId ?? receiptTxId;
        const linkedBankTxSource = manualTxId
          ? ("manual" as const)
          : receiptTxId
            ? ("receipt" as const)
            : null;
        return {
          ...r,
          toUser: r.toUserId ? (() => {
            const u = userRepo.getById(r.toUserId!);
            return u ? { id: u.id, name: u.name, email: u.email } : null;
          })() : null,
          linkedBankTxId,
          linkedBankTxSource,
        };
      });
      res.json({ requests: enriched });
    } catch (err) { next(err); }
  });

  router.get("/pending-count", (req, res, next) => {
    try {
      const count = splitRequestRepo.countPendingIncoming(req.session.userId!);
      res.json({ count });
    } catch (err) { next(err); }
  });

  router.get("/known-persons", (req, res, next) => {
    try {
      const persons = splitRequestRepo.listKnownPersons(req.session.userId!);
      res.json({ persons });
    } catch (err) { next(err); }
  });

  router.get("/:id/receipt-preview", previewLimit, async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const splitReq = splitRequestRepo.getById(req.params.id!);
      if (!splitReq) return res.status(404).json({ error: "not found" });
      if (splitReq.toUserId !== userId) return res.status(403).json({ error: "forbidden" });
      if (!["pending", "accepted"].includes(splitReq.status)) {
        return res.status(403).json({ error: "forbidden" });
      }
      if (!splitReq.receiptId) return res.status(404).json({ error: "no receipt file attached" });

      const fromUser = userRepo.getById(splitReq.fromUserId);
      if (!fromUser?.refreshToken) return res.status(503).json({ error: "source user unavailable" });

      const auth = buildOAuth2ClientForRefreshToken(config.google, fromUser.refreshToken);
      const drive = driveFor(auth);
      const meta = await drive.files.get({ fileId: splitReq.receiptId, fields: "mimeType" });
      const mimeType = meta.data.mimeType ?? "application/octet-stream";
      const fileRes = await drive.files.get(
        { fileId: splitReq.receiptId, alt: "media" },
        { responseType: "stream" }
      );
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      (fileRes.data as NodeJS.ReadableStream).pipe(res);
    } catch (err) {
      log.error({ err }, "receipt-preview error");
      next(err);
    }
  });

  router.post("/", createLimit, async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const parsed = CreateSplitRequestBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
      }

      const { toUserId, freeName, receiptId, receiptSqliteId, receiptMeta, betrag, nachricht } = parsed.data;

      if (toUserId === userId) {
        return res.status(400).json({ error: "cannot request from yourself" });
      }

      if (toUserId) {
        const toUser = userRepo.getById(toUserId);
        if (!toUser) return res.status(404).json({ error: "target user not found" });

        if (receiptId) {
          const fromUser = userRepo.getById(userId);
          if (!fromUser?.refreshToken) return res.status(409).json({ error: "drive not configured" });
          try {
            const auth = buildOAuth2ClientForRefreshToken(config.google, fromUser.refreshToken);
            const drive = driveFor(auth);
            await drive.files.get({ fileId: receiptId, fields: "id" });
          } catch {
            return res.status(400).json({ error: "receipt not accessible" });
          }
        }
      }

      const splitReq = splitRequestRepo.create({
        fromUserId: userId,
        toUserId: toUserId ?? null,
        freeName: freeName ?? null,
        receiptId: receiptId ?? null,
        receiptSqliteId: receiptSqliteId ?? null,
        receiptMeta,
        betrag,
        nachricht,
      });

      res.status(201).json({ request: splitReq });
    } catch (err) { next(err); }
  });

  router.patch("/:id/status", (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const parsed = UpdateStatusBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });

      const splitReq = splitRequestRepo.getById(req.params.id!);
      if (!splitReq) return res.status(404).json({ error: "not found" });
      const { status } = parsed.data;

      const isFreeName = splitReq.toUserId === null;

      if (isFreeName) {
        if (splitReq.fromUserId !== userId) return res.status(403).json({ error: "forbidden" });
      } else {
        if ((status === "accepted" || status === "rejected") && splitReq.toUserId !== userId) {
          return res.status(403).json({ error: "forbidden" });
        }
        if (status === "cancelled" && splitReq.fromUserId !== userId) {
          return res.status(403).json({ error: "forbidden" });
        }
        if (splitReq.status !== "pending") {
          return res.status(409).json({ error: "request already resolved" });
        }
      }

      splitRequestRepo.updateStatus(req.params.id!, status);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  router.patch("/:id/bank-tx", (req, res, next) => {
    try {
      const parsed = LinkBankTxBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid body" });

      const userId = req.session.userId!;
      const splitReq = splitRequestRepo.getById(req.params.id!);
      if (!splitReq) return res.status(404).json({ error: "not found" });
      if (splitReq.fromUserId !== userId) return res.status(403).json({ error: "forbidden" });

      const { bankTxId } = parsed.data;
      const splitId = req.params.id;
      if (bankTxId === null) {
        const existingLink = db
          .prepare("SELECT bank_tx_id FROM split_bank_links WHERE split_id = ? AND user_id = ?")
          .get(splitId, userId) as { bank_tx_id: string } | undefined;
        db.prepare("DELETE FROM split_bank_links WHERE split_id = ? AND user_id = ?").run(splitId, userId);
        db.prepare(
          "UPDATE split_requests SET status = 'pending', updated_at = ? WHERE id = ? AND status = 'accepted'"
        ).run(Date.now(), splitId);
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
    } catch (err) { next(err); }
  });

  router.delete("/:id", (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const splitReq = splitRequestRepo.getById(req.params.id!);
      if (!splitReq) return res.status(404).json({ error: "not found" });
      if (splitReq.fromUserId !== userId) return res.status(403).json({ error: "forbidden" });
      splitRequestRepo.delete(req.params.id!);
      db.prepare("DELETE FROM split_bank_links WHERE split_id = ? AND user_id = ?").run(req.params.id, userId);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
}

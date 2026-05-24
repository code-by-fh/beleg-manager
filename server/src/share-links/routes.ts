import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/requireAuth.js";
import type { Config } from "../config.js";
import type { Db } from "../db/index.js";
import type { ShareLinkRepo } from "./repo.js";
import type { SplitRequestRepo } from "../split-requests/repo.js";
import { CreateShareLinkBody, TokenParams, IdParams } from "./schema.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "share-links" });

const createLimit = rateLimit({
  windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => (req.session?.userId ?? req.ip) as string,
});

const publicReadLimit = rateLimit({
  windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.ip as string,
});

export type ShareLinksRouterDeps = {
  config: Config;
  db: Db;
  shareLinkRepo: ShareLinkRepo;
  splitRequestRepo: SplitRequestRepo;
  shareReceiptsWithEmail: (cfg: Config["google"], refreshToken: string, receiptIds: string[], email: string) => Promise<void>;
  sendShareLinkEmail: (cfg: Config["google"], refreshToken: string, opts: {
    ownerEmail: string; ownerName: string; personName: string; personEmail: string;
    shareUrl: string; expiresAt: number;
  }) => Promise<void>;
  clientOrigin: string;
};

export function buildShareLinksRouter(deps: ShareLinksRouterDeps) {
  const { config, db, shareLinkRepo, splitRequestRepo } = deps;
  const router = Router();

  // Public endpoint — no auth
  router.get("/:token", publicReadLimit, (req, res, next) => {
    try {
      const parsed = TokenParams.safeParse(req.params);
      if (!parsed.success) return res.status(400).json({ error: "invalid token" });

      const link = shareLinkRepo.getByToken(parsed.data.token);
      if (!link) return res.status(404).json({ error: "not found" });
      if (link.expiresAt <= Date.now()) return res.status(410).json({ error: "link expired" });

      const allRequests = splitRequestRepo.listOutgoing(link.fromUserId);

      // Build email map for registered users so we can match by email
      const userEmailMap = new Map<string, string>();
      const toUserIds = allRequests
        .map((r) => r.toUserId)
        .filter((id): id is string => id !== null);
      if (toUserIds.length > 0) {
        const placeholders = toUserIds.map(() => "?").join(",");
        (db.prepare(`SELECT id, email FROM users WHERE id IN (${placeholders})`).all(...toUserIds) as Array<{ id: string; email: string }>)
          .forEach((u) => userEmailMap.set(u.id, u.email));
      }

      const filtered = allRequests.filter((r) => {
        if (r.freeName) {
          return r.freeName.toLowerCase() === link.personName.toLowerCase();
        }
        if (r.toUserId) {
          return userEmailMap.get(r.toUserId) === link.personEmail;
        }
        return false;
      });

      const requests = filtered.map((r) => ({
        haendler: r.receiptMeta.haendler,
        datum: r.receiptMeta.datum,
        betrag: r.betrag,
        waehrung: r.receiptMeta.waehrung,
        nachricht: r.nachricht,
        status: r.status,
        driveFileUrl: r.receiptId
          ? `https://drive.google.com/file/d/${r.receiptId}/view`
          : null,
      }));

      res.json({ personName: link.personName, requests, expiresAt: link.expiresAt });
    } catch (err) { next(err); }
  });

  // All routes below require auth
  router.use(requireAuth);

  router.post("/", createLimit, async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const parsed = CreateShareLinkBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });

      const { personName, personEmail } = parsed.data;

      const owner = db.prepare(
        `SELECT id, email, name, refresh_token AS refreshToken FROM users WHERE id = ?`
      ).get(userId) as { id: string; email: string; name: string; refreshToken: string | null } | undefined;
      if (!owner?.refreshToken) return res.status(409).json({ error: "drive not configured" });

      // Share all Drive receipts for this person
      const outgoing = splitRequestRepo.listOutgoing(userId);
      const personRequests = outgoing.filter((r) => {
        if (r.freeName) return r.freeName.toLowerCase() === personName.toLowerCase();
        return false;
      });
      const receiptIds = personRequests
        .map((r) => r.receiptId)
        .filter((id): id is string => id !== null);

      if (receiptIds.length > 0) {
        await deps.shareReceiptsWithEmail(config.google, owner.refreshToken, receiptIds, personEmail);
      }

      const link = shareLinkRepo.upsert({ fromUserId: userId, personName, personEmail });
      const shareUrl = `${deps.clientOrigin}/share/${link.token}`;

      await deps.sendShareLinkEmail(config.google, owner.refreshToken, {
        ownerEmail: owner.email,
        ownerName: owner.name,
        personName,
        personEmail,
        shareUrl,
        expiresAt: link.expiresAt,
      });

      log.info({ linkId: link.id, personEmail }, "share link created/renewed");
      res.status(201).json({ shareUrl, expiresAt: link.expiresAt });
    } catch (err) { next(err); }
  });

  router.get("/", (req, res, next) => {
    try {
      const links = shareLinkRepo.listByOwner(req.session.userId!);
      res.json({ links: links.map((l) => ({ id: l.id, personName: l.personName, personEmail: l.personEmail, expiresAt: l.expiresAt })) });
    } catch (err) { next(err); }
  });

  router.delete("/:id", (req, res, next) => {
    try {
      const parsed = IdParams.safeParse(req.params);
      if (!parsed.success) return res.status(400).json({ error: "invalid id" });
      const deleted = shareLinkRepo.delete(parsed.data.id, req.session.userId!);
      if (!deleted) return res.status(404).json({ error: "not found" });
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
}

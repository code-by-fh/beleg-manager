import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/requireAuth.js";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { SplitRequestRepo } from "./repo.js";
import { CreateSplitRequestBody, UpdateStatusBody } from "./schema.js";
import { driveFor } from "../google/drive.js";
import { buildOAuth2ClientForRefreshToken } from "../google/client.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "split-requests" });

const createLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.session?.userId ?? req.ip) as string,
});

const previewLimit = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.session?.userId ?? req.ip) as string,
});

export function buildSplitRequestsRouter(
  config: Config,
  userRepo: UserRepo,
  splitRequestRepo: SplitRequestRepo
) {
  const router = Router();
  router.use(requireAuth);

  router.get("/incoming", (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const requests = splitRequestRepo.listIncoming(userId);
      const enriched = requests.map((r) => {
        const fromUser = userRepo.getById(r.fromUserId);
        return {
          ...r,
          fromUser: fromUser ? { id: fromUser.id, name: fromUser.name, email: fromUser.email } : null,
        };
      });
      res.json({ requests: enriched });
    } catch (err) {
      next(err);
    }
  });

  router.get("/outgoing", (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const requests = splitRequestRepo.listOutgoing(userId);
      const enriched = requests.map((r) => {
        const toUser = userRepo.getById(r.toUserId);
        return {
          ...r,
          toUser: toUser ? { id: toUser.id, name: toUser.name, email: toUser.email } : null,
        };
      });
      res.json({ requests: enriched });
    } catch (err) {
      next(err);
    }
  });

  router.get("/pending-count", (req, res, next) => {
    try {
      const count = splitRequestRepo.countPendingIncoming(req.session.userId!);
      res.json({ count });
    } catch (err) {
      next(err);
    }
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

      const fromUser = userRepo.getById(splitReq.fromUserId);
      const fromUserToken = fromUser?.refreshToken;
      if (!fromUserToken) {
        return res.status(503).json({ error: "source user unavailable" });
      }

      const auth = buildOAuth2ClientForRefreshToken(config.google, fromUserToken);
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

      const { toUserId, receiptId, receiptMeta, betrag, nachricht } = parsed.data;

      if (toUserId === userId) {
        return res.status(400).json({ error: "cannot request from yourself" });
      }

      const toUser = userRepo.getById(toUserId);
      if (!toUser) return res.status(404).json({ error: "target user not found" });

      const fromUser = userRepo.getById(userId);
      if (!fromUser?.refreshToken) {
        return res.status(409).json({ error: "drive not configured" });
      }

      try {
        const auth = buildOAuth2ClientForRefreshToken(config.google, fromUser.refreshToken);
        const drive = driveFor(auth);
        await drive.files.get({ fileId: receiptId, fields: "id" });
      } catch {
        return res.status(400).json({ error: "receipt not accessible" });
      }

      const splitReq = splitRequestRepo.create({
        fromUserId: userId,
        toUserId,
        receiptId,
        receiptMeta,
        betrag,
        nachricht,
      });

      res.status(201).json({ request: splitReq });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:id/status", (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const parsed = UpdateStatusBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
      }

      const splitReq = splitRequestRepo.getById(req.params.id!);
      if (!splitReq) return res.status(404).json({ error: "not found" });

      const { status } = parsed.data;

      if ((status === "accepted" || status === "rejected") && splitReq.toUserId !== userId) {
        return res.status(403).json({ error: "forbidden" });
      }
      if (status === "cancelled" && splitReq.fromUserId !== userId) {
        return res.status(403).json({ error: "forbidden" });
      }
      if (splitReq.status !== "pending") {
        return res.status(409).json({ error: "request already resolved" });
      }

      splitRequestRepo.updateStatus(req.params.id!, status);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const splitReq = splitRequestRepo.getById(req.params.id!);
      if (!splitReq) return res.status(404).json({ error: "not found" });
      if (splitReq.fromUserId !== userId) return res.status(403).json({ error: "forbidden" });
      if (!["cancelled", "rejected"].includes(splitReq.status)) {
        return res.status(409).json({ error: "can only delete cancelled or rejected requests" });
      }
      splitRequestRepo.delete(req.params.id!);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

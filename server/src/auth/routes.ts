import { Router } from "express";
import passport from "passport";
import { logger } from "../logger.js";
import type { Config } from "../config.js";
import type { UserRepo } from "./userRepo.js";
import type { GoogleAuthInfo } from "./passport.js";
import { GOOGLE_SCOPES } from "./passport.js";

const log = logger.child({ module: "auth" });

export function buildAuthRouter(config: Config, userRepo: UserRepo, onFirstLogin?: (userId: string) => Promise<void>) {
  const router = Router();

  router.get(
    "/google",
    passport.authenticate("google", {
      scope: GOOGLE_SCOPES,
      accessType: "offline",
      prompt: "consent",
      session: false,
    })
  );

  router.get(
    "/google/callback",
    passport.authenticate("google", { session: false, failureRedirect: `${config.clientOrigin}/login?error=oauth` }),
    async (req, res, next) => {
      try {
        const info = req.user as GoogleAuthInfo;
        req.session.userId = info.userId;
        req.session.accessToken = info.accessToken;
        req.session.refreshToken = info.refreshToken ?? undefined;
        if (info.expiresInSeconds) {
          req.session.accessTokenExpiry = Date.now() + info.expiresInSeconds * 1000;
        }
        await new Promise<void>((resolve, reject) =>
          req.session.save((err) => (err ? reject(err) : resolve()))
        );
        if (onFirstLogin) await onFirstLogin(info.userId);
        log.info({ userId: info.userId }, "login success");
        res.redirect(`${config.clientOrigin}/`);
      } catch (err) {
        log.error({ err }, "oauth callback error");
        next(err);
      }
    }
  );

  router.post("/logout", (req, res) => {
    const userId = req.session.userId;
    req.session.destroy(() => {
      log.info({ userId }, "logout");
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });

  router.get("/me", (req, res) => {
    if (!req.session.userId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const user = userRepo.getById(req.session.userId);
    if (!user) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      receiptsViewMode: user.receiptsViewMode,
      startPage: user.startPage,
    });
  });

  return router;
}

import { Router } from "express";
import passport from "passport";
import type { Config } from "../config.js";
import type { UserRepo } from "./userRepo.js";
import type { GoogleAuthInfo } from "./passport.js";
import { GOOGLE_SCOPES } from "./passport.js";

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
        res.redirect(`${config.clientOrigin}/`);
      } catch (err) {
        next(err);
      }
    }
  );

  router.post("/logout", (req, res) => {
    req.session.destroy(() => {
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
    res.json({ id: user.id, email: user.email, name: user.name });
  });

  return router;
}

import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import passport from "passport";
import path from "node:path";
import url from "node:url";
import type { Config } from "./config.js";
import { buildSessionMiddleware } from "./session/store.js";
import type { Db } from "./db/index.js";
import { createUserRepo } from "./auth/userRepo.js";
import { configurePassport } from "./auth/passport.js";
import { buildAuthRouter } from "./auth/routes.js";
import type { GeminiClient } from "./gemini/extract.js";
import type { PendingStore } from "./receipts/pendingStore.js";
import { buildReceiptsRouter } from "./receipts/routes.js";
import { buildStatsRouter } from "./stats/routes.js";
import { buildDriveRouter } from "./drive/routes.js";
import { buildAdminRouter } from "./admin/routes.js";
import { buildSettingsRouter } from "./settings/routes.js";
import { buildTelegramRouter } from "./telegram/bot.js";
import { buildSplitsRouter } from "./splits/routes.js";
import { buildBankRouter } from "./bank/routes.js";

export type AppDeps = {
  config: Config;
  db: Db;
  gemini: GeminiClient;
  pending: PendingStore;
  onFirstLogin?: (userId: string) => Promise<void>;
};

export function createApp(deps: AppDeps): Express {
  const userRepo = createUserRepo(deps.db);
  configurePassport(deps.config, userRepo);

  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: deps.config.clientOrigin, credentials: true }));
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(
    buildSessionMiddleware({
      secret: deps.config.sessionSecret,
      isProduction: deps.config.nodeEnv === "production",
      dataDir: "data",
    })
  );
  app.use(passport.initialize());

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/auth", buildAuthRouter(deps.config, userRepo, deps.onFirstLogin));
  app.use("/api/receipts", buildReceiptsRouter({
    config: deps.config,
    userRepo,
    gemini: deps.gemini,
    pending: deps.pending,
  }));
  app.use("/api/stats", buildStatsRouter(deps.config, userRepo));
  app.use("/api/drive", buildDriveRouter({
    config: deps.config,
    userRepo,
    gemini: deps.gemini,
    pending: deps.pending,
  }));
  app.use("/api/admin", buildAdminRouter(deps.config, userRepo, deps.db));
  app.use("/api/settings", buildSettingsRouter(userRepo, deps.config));
  app.use("/api/splits", buildSplitsRouter(deps.config, userRepo, deps.db));
  app.use("/api/bank", buildBankRouter({ config: deps.config, userRepo, db: deps.db }));
  app.use("/api/telegram", buildTelegramRouter({
    config: deps.config,
    userRepo,
    gemini: deps.gemini,
    pending: deps.pending,
  }));

  if (deps.config.nodeEnv === "production") {
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const clientDist = path.resolve(here, "../../client/dist");
    app.use(express.static(clientDist));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[error]", err);
    res.status(500).json({ error: err.message ?? "internal error" });
  });

  return app;
}

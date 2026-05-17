import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import passport from "passport";
import { pinoHttp } from "pino-http";
import path from "node:path";
import url from "node:url";
import { logger } from "./logger.js";
import type { Config } from "./config.js";
import { buildSessionMiddleware } from "./session/store.js";
import type { Db } from "./db/index.js";
import { createUserRepo } from "./auth/userRepo.js";
import { configurePassport } from "./auth/passport.js";
import { buildAuthRouter } from "./auth/routes.js";
import type { GeminiClient } from "./gemini/extract.js";
import type { PendingStore } from "./receipts/pendingStore.js";
import { buildReceiptsRouter } from "./receipts/routes.js";
import { createFailedVoiceRepo } from "./receipts/failedVoiceRepo.js";
import { createReceiptRepo } from "./receipts/receiptRepo.js";
import { buildStatsRouter } from "./stats/routes.js";
import { buildDriveRouter } from "./drive/routes.js";
import { buildAdminRouter } from "./admin/routes.js";
import { buildSettingsRouter } from "./settings/routes.js";
import { buildTelegramRouter } from "./telegram/bot.js";
import { buildSplitsRouter } from "./splits/routes.js";
import { buildBankRouter } from "./bank/routes.js";
import { createSplitRequestRepo } from "./split-requests/repo.js";
import { buildSplitRequestsRouter } from "./split-requests/routes.js";
import { buildUsersRouter } from "./users/searchRoutes.js";
import type { HealthRepo } from "./monitoring/repo.js";
import { buildMonitoringRouter } from "./monitoring/routes.js";

export type AppDeps = {
  config: Config;
  db: Db;
  gemini: GeminiClient;
  pending: PendingStore;
  healthRepo: HealthRepo;
  onFirstLogin?: (userId: string) => Promise<void>;
};

export function createApp(deps: AppDeps): Express {
  const userRepo = createUserRepo(deps.db);
  const splitRequestRepo = createSplitRequestRepo(deps.db);
  const failedVoiceRepo = createFailedVoiceRepo(deps.db);
  const receiptRepo = createReceiptRepo(deps.db);
  configurePassport(deps.config, userRepo);

  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(pinoHttp({
    logger,
    customLogLevel: (_req, res) => {
      if (res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    customSuccessMessage: (req, res, responseTime) =>
      `${req.method} ${req.url} ${res.statusCode} ${responseTime}ms`,
    customErrorMessage: (req, res, err) =>
      `${req.method} ${req.url} ${res.statusCode} ${err.message}`,
    serializers: {
      req: () => undefined as never,
      res: () => undefined as never,
    },
  }));
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
    failedVoice: failedVoiceRepo,
    receiptRepo,
  }));
  app.use("/api/stats", buildStatsRouter(userRepo, receiptRepo));
  app.use("/api/drive", buildDriveRouter({
    config: deps.config,
    userRepo,
    gemini: deps.gemini,
    pending: deps.pending,
    receiptRepo,
  }));
  app.use("/api/admin", buildAdminRouter(deps.config, userRepo, deps.db));
  app.use("/api/settings", buildSettingsRouter(userRepo, deps.config));
  app.use("/api/splits", buildSplitsRouter(deps.db));
  app.use("/api/bank", buildBankRouter({ config: deps.config, userRepo, db: deps.db }));
  app.use("/api/split-requests", buildSplitRequestsRouter(deps.config, userRepo, splitRequestRepo, deps.db));
  app.use("/api/users", buildUsersRouter(deps.db));
  app.use("/api/telegram", buildTelegramRouter({
    config: deps.config,
    userRepo,
    gemini: deps.gemini,
    healthRepo: deps.healthRepo,
    receiptRepo,
  }));
  app.use("/api/monitoring", buildMonitoringRouter(deps.healthRepo));

  if (deps.config.nodeEnv === "production") {
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const clientDist = path.resolve(here, "../../client/dist");
    app.use(express.static(clientDist));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, "unhandled error");
    res.status(500).json({ error: err.message ?? "internal error" });
  });

  return app;
}

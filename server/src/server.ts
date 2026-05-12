import { config as dotenvConfig } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
dotenvConfig({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env") });
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/index.js";
import { runMigrations } from "./db/migrations.js";
import { createUserRepo } from "./auth/userRepo.js";
import { buildOAuth2ClientForRefreshToken } from "./google/client.js";
import { bootstrapUserDrive } from "./google/bootstrap.js";
import { createGeminiClient } from "./gemini/extract.js";
import { createPendingStore } from "./receipts/pendingStore.js";
import { startInboxPoller } from "./inbox/poller.js";

const config = loadConfig(process.env);
const db = openDatabase("data/app.db");
runMigrations(db);
const userRepo = createUserRepo(db);
const gemini = createGeminiClient(config.geminiApiKey);
const pending = createPendingStore({ ttlMs: 30 * 60_000 });
setInterval(() => pending.sweep(), 5 * 60_000).unref();

async function onFirstLogin(userId: string) {
  const user = userRepo.getById(userId);
  if (!user?.refreshToken) return;
  const auth = buildOAuth2ClientForRefreshToken(config.google, user.refreshToken);
  await bootstrapUserDrive(auth, userId, userRepo);
}

const app = createApp({ config, db, gemini, pending, onFirstLogin });
const poller = startInboxPoller({ config, userRepo, gemini });
process.on("SIGTERM", () => poller.stop());

app.listen(config.port, () => {
  console.log(`server listening on http://localhost:${config.port}`);
});

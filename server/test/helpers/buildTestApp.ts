import { createApp } from "../../src/app.js";
import { openDatabase } from "../../src/db/index.js";
import { runMigrations } from "../../src/db/migrations.js";
import { createPendingStore } from "../../src/receipts/pendingStore.js";
import { emptyExtraction } from "../../src/gemini/schema.js";
import type { Config } from "../../src/config.js";
import type { GeminiClient } from "../../src/gemini/extract.js";

export const TEST_CONFIG: Config = {
  port: 0,
  nodeEnv: "test",
  sessionSecret: "x".repeat(32),
  google: { clientId: "id", clientSecret: "s", callbackUrl: "http://localhost/cb" },
  geminiApiKey: "k",
  clientOrigin: "http://localhost:5173",
  appPublicUrl: "http://localhost:5173",
};

export function makeTestApp(overrides?: { gemini?: GeminiClient }) {
  const db = openDatabase(":memory:");
  runMigrations(db);
  const gemini: GeminiClient = overrides?.gemini ?? {
    async extractFromPhoto() { return emptyExtraction(); },
    async extractFromTranscript() { return emptyExtraction(); },
  };
  const pending = createPendingStore({ ttlMs: 60_000 });
  return { app: createApp({ config: TEST_CONFIG, db, gemini, pending }), db, pending };
}


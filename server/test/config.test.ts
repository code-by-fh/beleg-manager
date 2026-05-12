import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  const valid = {
    PORT: "3000",
    NODE_ENV: "development",
    SESSION_SECRET: "x".repeat(32),
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "secret",
    OAUTH_CALLBACK_URL: "http://localhost:3000/api/auth/google/callback",
    GEMINI_API_KEY: "key",
    CLIENT_ORIGIN: "http://localhost:5173",
  };

  it("parses a valid env", () => {
    const cfg = loadConfig(valid);
    expect(cfg.port).toBe(3000);
    expect(cfg.nodeEnv).toBe("development");
    expect(cfg.sessionSecret).toHaveLength(32);
  });

  it("rejects short SESSION_SECRET", () => {
    expect(() => loadConfig({ ...valid, SESSION_SECRET: "short" })).toThrow();
  });

  it("rejects missing GOOGLE_CLIENT_ID", () => {
    const { GOOGLE_CLIENT_ID, ...rest } = valid;
    expect(() => loadConfig(rest)).toThrow();
  });
});

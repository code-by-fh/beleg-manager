import session from "express-session";
import ConnectSqlite3Factory from "connect-sqlite3";
import fs from "node:fs";

const SQLiteStore = ConnectSqlite3Factory(session);

export type SessionConfig = {
  secret: string;
  isProduction: boolean;
  dataDir: string;
};

export function buildSessionMiddleware(cfg: SessionConfig) {
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  return session({
    store: new (SQLiteStore as any)({ db: "sessions.sqlite", dir: cfg.dataDir }),
    secret: cfg.secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: cfg.isProduction,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  });
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpiry?: number;
  }
}

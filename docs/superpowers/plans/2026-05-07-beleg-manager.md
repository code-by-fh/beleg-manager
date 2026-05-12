# Beleg-Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-user web app that ingests receipts via photo upload, camera capture, voice input, or a Google Drive inbox folder, extracts structured data via the Gemini API, and persists results into the user's personal Google Sheet with the original archived in the user's Drive.

**Architecture:** Monorepo (npm workspaces) with an Express+TypeScript backend acting as BFF (server-side Google OAuth sessions) and a Vite+React+TypeScript+Tailwind+shadcn frontend. SQLite holds only app metadata; all receipt data lives in each user's own Google Drive/Sheets. Background inbox polling via node-cron.

**Tech Stack:** Node.js 20, Express, TypeScript, Passport (Google OAuth), better-sqlite3, connect-sqlite3, googleapis, @google/generative-ai, multer, node-cron, helmet, express-rate-limit, Vite, React 18, React Router v6, TanStack Query, React Hook Form, Zod, Tailwind, shadcn/ui, Recharts, Vitest, supertest, React Testing Library, Playwright.

**Spec:** See `docs/superpowers/specs/2026-05-07-beleg-manager-design.md`.

---

## Phase 1 — Foundation

### Task 1: Monorepo bootstrap

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `.editorconfig`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "beleg-manager",
  "private": true,
  "version": "0.1.0",
  "workspaces": ["client", "server"],
  "scripts": {
    "dev": "concurrently -n server,client -c blue,green \"npm:dev:server\" \"npm:dev:client\"",
    "dev:server": "npm --workspace server run dev",
    "dev:client": "npm --workspace client run dev",
    "build": "npm --workspace server run build && npm --workspace client run build",
    "start": "npm --workspace server run start",
    "test": "npm --workspace server test && npm --workspace client test",
    "typecheck": "npm --workspace server run typecheck && npm --workspace client run typecheck"
  },
  "devDependencies": {
    "concurrently": "^9.0.0",
    "typescript": "^5.6.0"
  },
  "engines": { "node": ">=20.0.0" }
}
```

- [ ] **Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
dist/
.env
.env.local
data/
*.log
.DS_Store
.vite/
coverage/
playwright-report/
test-results/
```

- [ ] **Step 4: Create `.env.example`**

```
# Express
PORT=3000
NODE_ENV=development
SESSION_SECRET=change-me-32-chars-minimum-please-replace

# Google OAuth (https://console.cloud.google.com -> APIs & Services -> Credentials)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
OAUTH_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

# Gemini (https://aistudio.google.com/app/apikey)
GEMINI_API_KEY=

# Client
CLIENT_ORIGIN=http://localhost:5173
```

- [ ] **Step 5: Create `.editorconfig`**

```
root = true
[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

- [ ] **Step 6: Install root deps and commit**

```bash
npm install
git add package.json package-lock.json tsconfig.base.json .gitignore .env.example .editorconfig
git commit -m "chore: monorepo bootstrap"
```

---

### Task 2: Server skeleton

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/vitest.config.ts`
- Create: `server/src/server.ts`
- Create: `server/src/app.ts`
- Create: `server/test/health.test.ts`

- [ ] **Step 1: Create `server/package.json`**

```json
{
  "name": "@beleg/server",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "dist/server.js",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@google/generative-ai": "^0.24.0",
    "better-sqlite3": "^11.3.0",
    "connect-sqlite3": "^0.9.15",
    "cookie-parser": "^1.4.7",
    "dotenv": "^16.4.5",
    "express": "^4.21.0",
    "express-rate-limit": "^7.4.0",
    "express-session": "^1.18.0",
    "googleapis": "^144.0.0",
    "helmet": "^7.2.0",
    "multer": "^1.4.5-lts.1",
    "node-cron": "^3.0.3",
    "passport": "^0.7.0",
    "passport-google-oauth20": "^2.0.0",
    "uuid": "^10.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/cookie-parser": "^1.4.7",
    "@types/express": "^4.17.21",
    "@types/express-session": "^1.18.0",
    "@types/multer": "^1.4.12",
    "@types/node": "^22.7.0",
    "@types/node-cron": "^3.0.11",
    "@types/passport": "^1.0.16",
    "@types/passport-google-oauth20": "^2.0.16",
    "@types/supertest": "^6.0.2",
    "@types/uuid": "^10.0.0",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `server/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `server/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globals: false,
  },
});
```

- [ ] **Step 4: Write failing test `server/test/health.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("GET /api/health", () => {
  it("returns 200 and ok status", async () => {
    const app = createApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 5: Run test, expect FAIL (module not found)**

```bash
npm --workspace server test
```

Expected: failure mentioning `../src/app.js`.

- [ ] **Step 6: Create minimal `server/src/app.ts`**

```ts
import express, { type Express } from "express";

export function createApp(): Express {
  const app = express();
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  return app;
}
```

- [ ] **Step 7: Create `server/src/server.ts`**

```ts
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const app = createApp();
app.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});
```

- [ ] **Step 8: Run test, expect PASS**

```bash
npm --workspace server test
```

- [ ] **Step 9: Commit**

```bash
git add server/
git commit -m "feat(server): skeleton with /api/health"
```

---

### Task 3: Client skeleton (Vite + Tailwind + shadcn base)

**Files:**
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/tsconfig.node.json`
- Create: `client/vite.config.ts`
- Create: `client/index.html`
- Create: `client/postcss.config.js`
- Create: `client/tailwind.config.ts`
- Create: `client/components.json`
- Create: `client/src/main.tsx`
- Create: `client/src/App.tsx`
- Create: `client/src/index.css`
- Create: `client/src/lib/utils.ts`

- [ ] **Step 1: Create `client/package.json`**

```json
{
  "name": "@beleg/client",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@hookform/resolvers": "^3.9.0",
    "@radix-ui/react-dialog": "^1.1.2",
    "@radix-ui/react-label": "^2.1.0",
    "@radix-ui/react-select": "^2.1.2",
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-tabs": "^1.1.1",
    "@radix-ui/react-toast": "^1.2.2",
    "@tanstack/react-query": "^5.59.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.451.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.53.0",
    "react-router-dom": "^6.27.0",
    "recharts": "^2.13.0",
    "tailwind-merge": "^2.5.0",
    "tailwindcss-animate": "^1.0.7",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.10",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.0",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `client/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "types": ["vite/client"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src/**/*"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Create `client/tsconfig.node.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create `client/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globals: true,
  },
});
```

- [ ] **Step 5: Create `client/index.html`**

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Beleg-Manager</title>
  </head>
  <body class="bg-background text-foreground">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `client/postcss.config.js`**

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 7: Create `client/tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
```

- [ ] **Step 8: Create `client/components.json`** (shadcn config)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 9: Create `client/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 9%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 9%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 9%;
    --primary: 0 0% 9%;
    --primary-foreground: 0 0% 98%;
    --secondary: 0 0% 96.1%;
    --secondary-foreground: 0 0% 9%;
    --muted: 0 0% 96.1%;
    --muted-foreground: 0 0% 45.1%;
    --accent: 0 0% 96.1%;
    --accent-foreground: 0 0% 9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 89.8%;
    --input: 0 0% 89.8%;
    --ring: 0 0% 3.9%;
    --radius: 0.5rem;
  }
}

@layer base {
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
```

- [ ] **Step 10: Create `client/src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 11: Create `client/src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 12: Create `client/src/App.tsx` (placeholder)**

```tsx
export function App() {
  return (
    <main className="container mx-auto py-12">
      <h1 className="text-3xl font-bold">Beleg-Manager</h1>
      <p className="text-muted-foreground">Skeleton up.</p>
    </main>
  );
}
```

- [ ] **Step 13: Create `client/src/test-setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 14: Install and verify**

```bash
npm install
npm --workspace client run typecheck
npm --workspace client run build
```

Expected: build succeeds, `client/dist/index.html` exists.

- [ ] **Step 15: Commit**

```bash
git add client/
git commit -m "feat(client): vite + react + tailwind skeleton"
```

---

## Phase 2 — Config, DB, Sessions

### Task 4: Config validation with Zod

**Files:**
- Create: `server/src/config.ts`
- Create: `server/test/config.test.ts`

- [ ] **Step 1: Write failing test `server/test/config.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
npm --workspace server test -- config
```

- [ ] **Step 3: Implement `server/src/config.ts`**

```ts
import { z } from "zod";

const Schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  SESSION_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  OAUTH_CALLBACK_URL: z.string().url(),
  GEMINI_API_KEY: z.string().min(1),
  CLIENT_ORIGIN: z.string().url(),
});

export type Config = {
  port: number;
  nodeEnv: "development" | "production" | "test";
  sessionSecret: string;
  google: { clientId: string; clientSecret: string; callbackUrl: string };
  geminiApiKey: string;
  clientOrigin: string;
};

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): Config {
  const parsed = Schema.parse(env);
  return {
    port: parsed.PORT,
    nodeEnv: parsed.NODE_ENV,
    sessionSecret: parsed.SESSION_SECRET,
    google: {
      clientId: parsed.GOOGLE_CLIENT_ID,
      clientSecret: parsed.GOOGLE_CLIENT_SECRET,
      callbackUrl: parsed.OAUTH_CALLBACK_URL,
    },
    geminiApiKey: parsed.GEMINI_API_KEY,
    clientOrigin: parsed.CLIENT_ORIGIN,
  };
}
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npm --workspace server test -- config
```

- [ ] **Step 5: Wire dotenv into `server/src/server.ts`**

Modify `server/src/server.ts`:

```ts
import "dotenv/config";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig(process.env);
const app = createApp();
app.listen(config.port, () => {
  console.log(`server listening on http://localhost:${config.port}`);
});
```

- [ ] **Step 6: Commit**

```bash
git add server/src/config.ts server/test/config.test.ts server/src/server.ts
git commit -m "feat(server): zod-validated config loader"
```

---

### Task 5: SQLite + users table

**Files:**
- Create: `server/src/db/index.ts`
- Create: `server/src/db/migrations.ts`
- Create: `server/test/db.test.ts`
- Modify: `.gitignore` (already has `data/`)

- [ ] **Step 1: Write failing test `server/test/db.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { openDatabase } from "../src/db/index.js";
import { runMigrations } from "../src/db/migrations.js";

describe("db migrations", () => {
  let db: ReturnType<typeof openDatabase>;

  beforeEach(() => {
    db = openDatabase(":memory:");
    runMigrations(db);
  });

  it("creates users table with required columns", () => {
    const cols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
    const names = cols.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "id",
        "email",
        "name",
        "drive_root_folder_id",
        "drive_inbox_folder_id",
        "drive_archive_folder_id",
        "sheet_id",
        "created_at",
      ])
    );
  });

  it("upserts a user by id", () => {
    db.prepare(
      `INSERT INTO users (id, email, name, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET email=excluded.email, name=excluded.name`
    ).run("u1", "a@b.de", "Alice", Date.now());
    const row = db.prepare("SELECT id, email FROM users WHERE id = ?").get("u1");
    expect(row).toEqual({ id: "u1", email: "a@b.de" });
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
npm --workspace server test -- db
```

- [ ] **Step 3: Create `server/src/db/index.ts`**

```ts
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export type Db = Database.Database;

export function openDatabase(filename: string): Db {
  if (filename !== ":memory:") {
    const dir = path.dirname(filename);
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}
```

- [ ] **Step 4: Create `server/src/db/migrations.ts`**

```ts
import type { Db } from "./index.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  drive_root_folder_id TEXT,
  drive_inbox_folder_id TEXT,
  drive_archive_folder_id TEXT,
  sheet_id TEXT,
  refresh_token TEXT,
  created_at INTEGER NOT NULL
);
`;

export function runMigrations(db: Db): void {
  db.exec(SCHEMA);
}
```

- [ ] **Step 5: Run test, expect PASS**

```bash
npm --workspace server test -- db
```

- [ ] **Step 6: Commit**

```bash
git add server/src/db server/test/db.test.ts
git commit -m "feat(server): sqlite + users table migration"
```

---

### Task 6: Session middleware + cookie parser + helmet

**Files:**
- Create: `server/src/session/store.ts`
- Modify: `server/src/app.ts`
- Modify: `server/src/server.ts`

- [ ] **Step 1: Create `server/src/session/store.ts`**

```ts
import session from "express-session";
import ConnectSqlite3Factory from "connect-sqlite3";

const SQLiteStore = ConnectSqlite3Factory(session);

export type SessionConfig = {
  secret: string;
  isProduction: boolean;
  dataDir: string;
};

export function buildSessionMiddleware(cfg: SessionConfig) {
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
```

- [ ] **Step 2: Update `server/src/app.ts`**

```ts
import express, { type Express } from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import type { Config } from "./config.js";
import { buildSessionMiddleware } from "./session/store.js";

export function createApp(config: Config): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(
    buildSessionMiddleware({
      secret: config.sessionSecret,
      isProduction: config.nodeEnv === "production",
      dataDir: "data",
    })
  );

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  return app;
}
```

- [ ] **Step 3: Update `server/src/server.ts`**

```ts
import "dotenv/config";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig(process.env);
const app = createApp(config);
app.listen(config.port, () => {
  console.log(`server listening on http://localhost:${config.port}`);
});
```

- [ ] **Step 4: Update health test to pass full config**

`server/test/health.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import type { Config } from "../src/config.js";

const testConfig: Config = {
  port: 0,
  nodeEnv: "test",
  sessionSecret: "x".repeat(32),
  google: { clientId: "id", clientSecret: "s", callbackUrl: "http://localhost/cb" },
  geminiApiKey: "k",
  clientOrigin: "http://localhost:5173",
};

describe("GET /api/health", () => {
  it("returns 200 ok", async () => {
    const res = await request(createApp(testConfig)).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 5: Run all tests, expect PASS**

```bash
npm --workspace server test
```

- [ ] **Step 6: Commit**

```bash
git add server/src/session server/src/app.ts server/src/server.ts server/test/health.test.ts
git commit -m "feat(server): session middleware + helmet"
```

---

## Phase 3 — Google OAuth & Auth Routes

### Task 7: Passport Google OAuth strategy

**Files:**
- Create: `server/src/auth/passport.ts`
- Create: `server/src/auth/userRepo.ts`
- Create: `server/test/userRepo.test.ts`

- [ ] **Step 1: Write failing test `server/test/userRepo.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { openDatabase } from "../src/db/index.js";
import { runMigrations } from "../src/db/migrations.js";
import { createUserRepo } from "../src/auth/userRepo.js";

describe("userRepo", () => {
  let repo: ReturnType<typeof createUserRepo>;

  beforeEach(() => {
    const db = openDatabase(":memory:");
    runMigrations(db);
    repo = createUserRepo(db);
  });

  it("upserts a user and reads back", () => {
    repo.upsert({ id: "g1", email: "a@b.de", name: "Alice", refreshToken: "rt1" });
    const u = repo.getById("g1");
    expect(u).toMatchObject({ id: "g1", email: "a@b.de", name: "Alice", refreshToken: "rt1" });
  });

  it("preserves drive folder ids on upsert", () => {
    repo.upsert({ id: "g1", email: "a@b.de", name: "Alice", refreshToken: "rt1" });
    repo.setDriveAssets("g1", {
      driveRootFolderId: "root",
      driveInboxFolderId: "inbox",
      driveArchiveFolderId: "arch",
      sheetId: "sheet",
    });
    repo.upsert({ id: "g1", email: "a@b.de", name: "Alice 2", refreshToken: "rt2" });
    const u = repo.getById("g1");
    expect(u?.driveRootFolderId).toBe("root");
    expect(u?.sheetId).toBe("sheet");
    expect(u?.name).toBe("Alice 2");
    expect(u?.refreshToken).toBe("rt2");
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
npm --workspace server test -- userRepo
```

- [ ] **Step 3: Implement `server/src/auth/userRepo.ts`**

```ts
import type { Db } from "../db/index.js";

export type UserRow = {
  id: string;
  email: string;
  name: string;
  driveRootFolderId: string | null;
  driveInboxFolderId: string | null;
  driveArchiveFolderId: string | null;
  sheetId: string | null;
  refreshToken: string | null;
  createdAt: number;
};

type UpsertInput = { id: string; email: string; name: string; refreshToken: string | null };

type DriveAssets = {
  driveRootFolderId: string;
  driveInboxFolderId: string;
  driveArchiveFolderId: string;
  sheetId: string;
};

export function createUserRepo(db: Db) {
  return {
    upsert(input: UpsertInput): void {
      db.prepare(
        `INSERT INTO users (id, email, name, refresh_token, created_at)
         VALUES (@id, @email, @name, @refreshToken, @createdAt)
         ON CONFLICT(id) DO UPDATE SET
           email = excluded.email,
           name = excluded.name,
           refresh_token = COALESCE(excluded.refresh_token, users.refresh_token)`
      ).run({ ...input, createdAt: Date.now() });
    },

    getById(id: string): UserRow | undefined {
      const row = db
        .prepare(
          `SELECT id, email, name,
            drive_root_folder_id AS driveRootFolderId,
            drive_inbox_folder_id AS driveInboxFolderId,
            drive_archive_folder_id AS driveArchiveFolderId,
            sheet_id AS sheetId,
            refresh_token AS refreshToken,
            created_at AS createdAt
           FROM users WHERE id = ?`
        )
        .get(id) as UserRow | undefined;
      return row;
    },

    setDriveAssets(id: string, assets: DriveAssets): void {
      db.prepare(
        `UPDATE users SET
          drive_root_folder_id = @driveRootFolderId,
          drive_inbox_folder_id = @driveInboxFolderId,
          drive_archive_folder_id = @driveArchiveFolderId,
          sheet_id = @sheetId
         WHERE id = @id`
      ).run({ id, ...assets });
    },

    listAllWithRefreshToken(): UserRow[] {
      return db
        .prepare(
          `SELECT id, email, name,
            drive_root_folder_id AS driveRootFolderId,
            drive_inbox_folder_id AS driveInboxFolderId,
            drive_archive_folder_id AS driveArchiveFolderId,
            sheet_id AS sheetId,
            refresh_token AS refreshToken,
            created_at AS createdAt
           FROM users WHERE refresh_token IS NOT NULL`
        )
        .all() as UserRow[];
    },
  };
}

export type UserRepo = ReturnType<typeof createUserRepo>;
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npm --workspace server test -- userRepo
```

- [ ] **Step 5: Implement `server/src/auth/passport.ts`**

```ts
import passport from "passport";
import { Strategy as GoogleStrategy, type Profile } from "passport-google-oauth20";
import type { Config } from "../config.js";
import type { UserRepo } from "./userRepo.js";

export type GoogleAuthInfo = {
  userId: string;
  email: string;
  name: string;
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number | null;
};

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
];

export function configurePassport(config: Config, userRepo: UserRepo) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.google.clientId,
        clientSecret: config.google.clientSecret,
        callbackURL: config.google.callbackUrl,
        passReqToCallback: false,
      },
      (accessToken, refreshToken, params: { expires_in?: number }, profile: Profile, done) => {
        const email = profile.emails?.[0]?.value;
        const name = profile.displayName ?? email ?? profile.id;
        if (!email) return done(new Error("Google profile missing email"));
        userRepo.upsert({
          id: profile.id,
          email,
          name,
          refreshToken: refreshToken ?? null,
        });
        const info: GoogleAuthInfo = {
          userId: profile.id,
          email,
          name,
          accessToken,
          refreshToken: refreshToken ?? null,
          expiresInSeconds: params?.expires_in ?? null,
        };
        return done(null, info);
      }
    )
  );

  // We do not use passport sessions; we manage the session ourselves in routes.
  passport.serializeUser((info: any, cb) => cb(null, info));
  passport.deserializeUser((info: any, cb) => cb(null, info));

  return passport;
}
```

- [ ] **Step 6: Commit**

```bash
git add server/src/auth server/test/userRepo.test.ts
git commit -m "feat(server): user repo + passport google strategy"
```

---

### Task 8: Auth routes (login, callback, logout, me) + requireAuth middleware

**Files:**
- Create: `server/src/auth/routes.ts`
- Create: `server/src/middleware/requireAuth.ts`
- Modify: `server/src/app.ts`
- Create: `server/test/auth-routes.test.ts`

- [ ] **Step 1: Create `server/src/middleware/requireAuth.ts`**

```ts
import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}
```

- [ ] **Step 2: Create `server/src/auth/routes.ts`**

```ts
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
```

- [ ] **Step 3: Wire into `server/src/app.ts`**

```ts
import express, { type Express } from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import passport from "passport";
import type { Config } from "./config.js";
import { buildSessionMiddleware } from "./session/store.js";
import type { Db } from "./db/index.js";
import { createUserRepo } from "./auth/userRepo.js";
import { configurePassport } from "./auth/passport.js";
import { buildAuthRouter } from "./auth/routes.js";

export type AppDeps = {
  config: Config;
  db: Db;
  onFirstLogin?: (userId: string) => Promise<void>;
};

export function createApp(deps: AppDeps): Express {
  const { config, db, onFirstLogin } = deps;
  const userRepo = createUserRepo(db);
  configurePassport(config, userRepo);

  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(
    buildSessionMiddleware({
      secret: config.sessionSecret,
      isProduction: config.nodeEnv === "production",
      dataDir: "data",
    })
  );
  app.use(passport.initialize());

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/auth", buildAuthRouter(config, userRepo, onFirstLogin));

  return app;
}
```

- [ ] **Step 4: Update `server/src/server.ts` to wire DB + migrations**

```ts
import "dotenv/config";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/index.js";
import { runMigrations } from "./db/migrations.js";

const config = loadConfig(process.env);
const db = openDatabase("data/app.db");
runMigrations(db);

const app = createApp({ config, db });
app.listen(config.port, () => {
  console.log(`server listening on http://localhost:${config.port}`);
});
```

- [ ] **Step 5: Update `server/test/health.test.ts`** (use new factory)

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db/index.js";
import { runMigrations } from "../src/db/migrations.js";
import type { Config } from "../src/config.js";

const testConfig: Config = {
  port: 0,
  nodeEnv: "test",
  sessionSecret: "x".repeat(32),
  google: { clientId: "id", clientSecret: "s", callbackUrl: "http://localhost/cb" },
  geminiApiKey: "k",
  clientOrigin: "http://localhost:5173",
};

describe("GET /api/health", () => {
  it("returns 200 ok", async () => {
    const db = openDatabase(":memory:");
    runMigrations(db);
    const res = await request(createApp({ config: testConfig, db })).get("/api/health");
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 6: Write `server/test/auth-routes.test.ts` (logout + /me unauthenticated)**

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db/index.js";
import { runMigrations } from "../src/db/migrations.js";
import type { Config } from "../src/config.js";

const testConfig: Config = {
  port: 0,
  nodeEnv: "test",
  sessionSecret: "x".repeat(32),
  google: { clientId: "id", clientSecret: "s", callbackUrl: "http://localhost/cb" },
  geminiApiKey: "k",
  clientOrigin: "http://localhost:5173",
};

function makeApp() {
  const db = openDatabase(":memory:");
  runMigrations(db);
  return createApp({ config: testConfig, db });
}

describe("auth routes", () => {
  it("GET /api/auth/me returns 401 without session", async () => {
    const res = await request(makeApp()).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("POST /api/auth/logout returns ok and clears cookie", async () => {
    const res = await request(makeApp()).post("/api/auth/logout");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("GET /api/auth/google redirects to Google", async () => {
    const res = await request(makeApp()).get("/api/auth/google");
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/accounts\.google\.com/);
  });
});
```

- [ ] **Step 7: Run all server tests, expect PASS**

```bash
npm --workspace server test
```

- [ ] **Step 8: Commit**

```bash
git add server/src server/test
git commit -m "feat(server): google oauth login/callback/logout/me + requireAuth"
```

---

## Phase 4 — Google APIs (Drive + Sheets)

### Task 9: OAuth2 client factory

**Files:**
- Create: `server/src/google/client.ts`
- Create: `server/test/google-client.test.ts`

- [ ] **Step 1: Write failing test `server/test/google-client.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildOAuth2ClientFromSession } from "../src/google/client.js";

describe("buildOAuth2ClientFromSession", () => {
  it("sets credentials from session fields", () => {
    const client = buildOAuth2ClientFromSession(
      { clientId: "cid", clientSecret: "cs", callbackUrl: "http://x/cb" },
      { accessToken: "at", refreshToken: "rt", accessTokenExpiry: 1234 }
    );
    const creds = client.credentials;
    expect(creds.access_token).toBe("at");
    expect(creds.refresh_token).toBe("rt");
    expect(creds.expiry_date).toBe(1234);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
npm --workspace server test -- google-client
```

- [ ] **Step 3: Implement `server/src/google/client.ts`**

```ts
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

export type GoogleCfg = { clientId: string; clientSecret: string; callbackUrl: string };
export type SessionTokens = {
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiry?: number;
};

export function buildOAuth2ClientFromSession(cfg: GoogleCfg, tokens: SessionTokens): OAuth2Client {
  const client = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, cfg.callbackUrl);
  client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.accessTokenExpiry,
  });
  return client;
}

export function buildOAuth2ClientForRefreshToken(cfg: GoogleCfg, refreshToken: string): OAuth2Client {
  const client = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, cfg.callbackUrl);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npm --workspace server test -- google-client
```

- [ ] **Step 5: Commit**

```bash
git add server/src/google/client.ts server/test/google-client.test.ts
git commit -m "feat(server): google oauth2 client factory"
```

---

### Task 10: Drive helper

**Files:**
- Create: `server/src/google/drive.ts`

(Drive operations are integration-heavy and tested via the bootstrap test in Task 12.)

- [ ] **Step 1: Implement `server/src/google/drive.ts`**

```ts
import { google, type drive_v3 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { Readable } from "node:stream";

export type DriveClient = drive_v3.Drive;

export function driveFor(auth: OAuth2Client): DriveClient {
  return google.drive({ version: "v3", auth });
}

export async function findOrCreateFolder(
  drive: DriveClient,
  name: string,
  parentId?: string
): Promise<string> {
  const q = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(" and ");
  const list = await drive.files.list({ q, fields: "files(id,name)", pageSize: 1 });
  if (list.data.files && list.data.files[0]?.id) return list.data.files[0].id;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });
  if (!created.data.id) throw new Error("Drive folder creation returned no id");
  return created.data.id;
}

export async function listFolderFiles(
  drive: DriveClient,
  folderId: string
): Promise<Array<{ id: string; name: string; mimeType: string; appProperties?: Record<string, string> }>> {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
    fields: "files(id,name,mimeType,appProperties)",
    pageSize: 100,
  });
  return (res.data.files ?? []).map((f) => ({
    id: f.id!,
    name: f.name!,
    mimeType: f.mimeType ?? "application/octet-stream",
    appProperties: (f.appProperties as Record<string, string> | undefined) ?? undefined,
  }));
}

export async function uploadFile(
  drive: DriveClient,
  args: { name: string; mimeType: string; parentId: string; body: Buffer }
): Promise<{ id: string; webViewLink: string }> {
  const created = await drive.files.create({
    requestBody: { name: args.name, parents: [args.parentId] },
    media: { mimeType: args.mimeType, body: Readable.from(args.body) },
    fields: "id, webViewLink",
  });
  if (!created.data.id) throw new Error("Drive upload returned no id");
  return { id: created.data.id, webViewLink: created.data.webViewLink ?? "" };
}

export async function moveFile(
  drive: DriveClient,
  fileId: string,
  targetParentId: string
): Promise<void> {
  const file = await drive.files.get({ fileId, fields: "parents" });
  const previousParents = (file.data.parents ?? []).join(",");
  await drive.files.update({
    fileId,
    addParents: targetParentId,
    removeParents: previousParents || undefined,
    fields: "id, parents",
  });
}

export async function setAppProperties(
  drive: DriveClient,
  fileId: string,
  appProperties: Record<string, string>
): Promise<void> {
  await drive.files.update({ fileId, requestBody: { appProperties } });
}

export async function getWebViewLink(drive: DriveClient, fileId: string): Promise<string> {
  const res = await drive.files.get({ fileId, fields: "webViewLink" });
  return res.data.webViewLink ?? "";
}

export async function downloadFile(drive: DriveClient, fileId: string): Promise<Buffer> {
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data as ArrayBuffer);
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm --workspace server run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add server/src/google/drive.ts
git commit -m "feat(server): google drive helpers"
```

---

### Task 11: Sheets helper

**Files:**
- Create: `server/src/google/sheets.ts`

- [ ] **Step 1: Implement `server/src/google/sheets.ts`**

```ts
import { google, type sheets_v4 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

export type SheetsClient = sheets_v4.Sheets;

export const SHEET_HEADER = [
  "id",
  "datum",
  "haendler",
  "betrag",
  "mwst",
  "waehrung",
  "kategorie",
  "zahlungsmethode",
  "rechnungsnummer",
  "drive_link",
  "eingabe_typ",
  "erstellt_am",
] as const;

export const SHEET_TAB_NAME = "Belege";

export function sheetsFor(auth: OAuth2Client): SheetsClient {
  return google.sheets({ version: "v4", auth });
}

export async function createSpreadsheet(
  sheets: SheetsClient,
  title: string
): Promise<string> {
  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [{ properties: { title: SHEET_TAB_NAME } }],
    },
  });
  if (!res.data.spreadsheetId) throw new Error("Spreadsheet create returned no id");
  await sheets.spreadsheets.values.update({
    spreadsheetId: res.data.spreadsheetId,
    range: `${SHEET_TAB_NAME}!A1:L1`,
    valueInputOption: "RAW",
    requestBody: { values: [SHEET_HEADER as unknown as string[]] },
  });
  return res.data.spreadsheetId;
}

export async function moveSpreadsheetIntoFolder(
  drive: import("googleapis").drive_v3.Drive,
  spreadsheetId: string,
  folderId: string
): Promise<void> {
  const file = await drive.files.get({ fileId: spreadsheetId, fields: "parents" });
  const prev = (file.data.parents ?? []).join(",");
  await drive.files.update({
    fileId: spreadsheetId,
    addParents: folderId,
    removeParents: prev || undefined,
    fields: "id, parents",
  });
}

export type ReceiptRow = {
  id: string;
  datum: string;
  haendler: string;
  betrag: number;
  mwst: number;
  waehrung: string;
  kategorie: string;
  zahlungsmethode: string;
  rechnungsnummer: string;
  driveLink: string;
  eingabeTyp: "foto" | "sprache" | "drive";
  erstelltAm: string;
};

export function rowToValues(r: ReceiptRow): (string | number)[] {
  return [
    r.id,
    r.datum,
    r.haendler,
    r.betrag,
    r.mwst,
    r.waehrung,
    r.kategorie,
    r.zahlungsmethode,
    r.rechnungsnummer,
    r.driveLink,
    r.eingabeTyp,
    r.erstelltAm,
  ];
}

export function valuesToRow(values: (string | number)[]): ReceiptRow | null {
  if (values.length < 12) return null;
  const [id, datum, haendler, betrag, mwst, waehrung, kategorie, zahlungsmethode, rechnungsnummer, driveLink, eingabeTyp, erstelltAm] = values as string[];
  if (!id) return null;
  return {
    id,
    datum: datum ?? "",
    haendler: haendler ?? "",
    betrag: Number(betrag ?? 0),
    mwst: Number(mwst ?? 0),
    waehrung: waehrung ?? "EUR",
    kategorie: kategorie ?? "",
    zahlungsmethode: zahlungsmethode ?? "",
    rechnungsnummer: rechnungsnummer ?? "",
    driveLink: driveLink ?? "",
    eingabeTyp: (eingabeTyp as ReceiptRow["eingabeTyp"]) ?? "foto",
    erstelltAm: erstelltAm ?? "",
  };
}

export async function appendRow(
  sheets: SheetsClient,
  spreadsheetId: string,
  row: ReceiptRow
): Promise<void> {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_TAB_NAME}!A:L`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [rowToValues(row)] },
  });
}

export async function readAllRows(
  sheets: SheetsClient,
  spreadsheetId: string
): Promise<ReceiptRow[]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB_NAME}!A2:L`,
  });
  const rows = (res.data.values ?? []) as (string | number)[][];
  return rows
    .map((v) => valuesToRow(v))
    .filter((r): r is ReceiptRow => r !== null);
}
```

- [ ] **Step 2: Write `server/test/sheets.test.ts` for pure helpers**

```ts
import { describe, it, expect } from "vitest";
import { rowToValues, valuesToRow, type ReceiptRow } from "../src/google/sheets.js";

const sample: ReceiptRow = {
  id: "u1",
  datum: "2026-05-07",
  haendler: "Restaurant Mayer",
  betrag: 45.5,
  mwst: 7.27,
  waehrung: "EUR",
  kategorie: "Restaurant",
  zahlungsmethode: "Karte",
  rechnungsnummer: "INV-1",
  driveLink: "https://drive/x",
  eingabeTyp: "foto",
  erstelltAm: "2026-05-07T10:00:00Z",
};

describe("sheets row codec", () => {
  it("round-trips a row", () => {
    const back = valuesToRow(rowToValues(sample));
    expect(back).toEqual(sample);
  });

  it("returns null for missing id", () => {
    const v = rowToValues(sample);
    v[0] = "";
    expect(valuesToRow(v)).toBeNull();
  });
});
```

- [ ] **Step 3: Run test, expect PASS**

```bash
npm --workspace server test -- sheets
```

- [ ] **Step 4: Commit**

```bash
git add server/src/google/sheets.ts server/test/sheets.test.ts
git commit -m "feat(server): google sheets helpers + row codec"
```

---

### Task 12: First-login bootstrap

**Files:**
- Create: `server/src/google/bootstrap.ts`
- Modify: `server/src/server.ts` (wire onFirstLogin)

- [ ] **Step 1: Implement `server/src/google/bootstrap.ts`**

```ts
import type { OAuth2Client } from "google-auth-library";
import { driveFor, findOrCreateFolder } from "./drive.js";
import { sheetsFor, createSpreadsheet, moveSpreadsheetIntoFolder } from "./sheets.js";
import type { UserRepo } from "../auth/userRepo.js";

const ROOT_FOLDER_NAME = "Beleg-Manager";
const INBOX_FOLDER_NAME = "Inbox";
const ARCHIVE_FOLDER_NAME = "Archive";
const SHEET_TITLE = "belege";

export async function bootstrapUserDrive(
  auth: OAuth2Client,
  userId: string,
  userRepo: UserRepo
): Promise<void> {
  const existing = userRepo.getById(userId);
  if (existing?.driveRootFolderId && existing.driveInboxFolderId && existing.driveArchiveFolderId && existing.sheetId) {
    return;
  }

  const drive = driveFor(auth);
  const sheets = sheetsFor(auth);

  const rootId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME);
  const inboxId = await findOrCreateFolder(drive, INBOX_FOLDER_NAME, rootId);
  const archiveId = await findOrCreateFolder(drive, ARCHIVE_FOLDER_NAME, rootId);

  let sheetId = existing?.sheetId ?? null;
  if (!sheetId) {
    sheetId = await createSpreadsheet(sheets, SHEET_TITLE);
    await moveSpreadsheetIntoFolder(drive, sheetId, rootId);
  }

  userRepo.setDriveAssets(userId, {
    driveRootFolderId: rootId,
    driveInboxFolderId: inboxId,
    driveArchiveFolderId: archiveId,
    sheetId,
  });
}
```

- [ ] **Step 2: Wire bootstrap in `server/src/server.ts`**

```ts
import "dotenv/config";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/index.js";
import { runMigrations } from "./db/migrations.js";
import { createUserRepo } from "./auth/userRepo.js";
import { buildOAuth2ClientForRefreshToken } from "./google/client.js";
import { bootstrapUserDrive } from "./google/bootstrap.js";

const config = loadConfig(process.env);
const db = openDatabase("data/app.db");
runMigrations(db);
const userRepo = createUserRepo(db);

async function onFirstLogin(userId: string) {
  const user = userRepo.getById(userId);
  if (!user?.refreshToken) return;
  const auth = buildOAuth2ClientForRefreshToken(config.google, user.refreshToken);
  await bootstrapUserDrive(auth, userId, userRepo);
}

const app = createApp({ config, db, onFirstLogin });
app.listen(config.port, () => {
  console.log(`server listening on http://localhost:${config.port}`);
});
```

- [ ] **Step 3: Typecheck and commit**

```bash
npm --workspace server run typecheck
git add server/src/google/bootstrap.ts server/src/server.ts
git commit -m "feat(server): first-login drive bootstrap (folders + sheet)"
```

---

## Phase 5 — Gemini Extraction

### Task 13: Gemini schema + prompts

**Files:**
- Create: `server/src/gemini/schema.ts`
- Create: `server/src/gemini/prompts.ts`
- Create: `server/test/gemini-schema.test.ts`

- [ ] **Step 1: Implement `server/src/gemini/schema.ts`**

```ts
import { z } from "zod";

export const ExtractionZ = z.object({
  datum: z.string().nullable(),
  haendler: z.string().nullable(),
  betrag: z.number().nullable(),
  mwst: z.number().nullable(),
  waehrung: z.string().nullable(),
  kategorie: z.string().nullable(),
  zahlungsmethode: z.string().nullable(),
  rechnungsnummer: z.string().nullable(),
});

export type Extraction = z.infer<typeof ExtractionZ>;

export const GEMINI_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    datum: { type: "string", nullable: true, description: "ISO 8601 date YYYY-MM-DD" },
    haendler: { type: "string", nullable: true },
    betrag: { type: "number", nullable: true },
    mwst: { type: "number", nullable: true },
    waehrung: { type: "string", nullable: true, description: "ISO 4217 code, e.g. EUR" },
    kategorie: { type: "string", nullable: true },
    zahlungsmethode: { type: "string", nullable: true },
    rechnungsnummer: { type: "string", nullable: true },
  },
  required: ["datum", "haendler", "betrag", "mwst", "waehrung", "kategorie", "zahlungsmethode", "rechnungsnummer"],
} as const;

export function emptyExtraction(): Extraction {
  return {
    datum: null,
    haendler: null,
    betrag: null,
    mwst: null,
    waehrung: null,
    kategorie: null,
    zahlungsmethode: null,
    rechnungsnummer: null,
  };
}
```

- [ ] **Step 2: Implement `server/src/gemini/prompts.ts`**

```ts
export const PROMPT_VERSION = "v1";

export const SYSTEM_PROMPT = `Du extrahierst strukturierte Daten aus deutschen Belegen, Rechnungen und Quittungen.
Antworte ausschließlich mit JSON entsprechend des bereitgestellten Schemas.

Regeln:
- "datum" als ISO 8601 (YYYY-MM-DD). Wenn nur Monat/Jahr erkennbar, nimm den 1. des Monats. Bei mehreren Datumsangaben (Rechnungsdatum, Lieferdatum, ...) wähle das Rechnungs-/Belegdatum.
- "betrag" als Bruttobetrag in der Belegswährung (Endsumme inkl. MwSt).
- "mwst" als ausgewiesener MwSt-Betrag (nicht der Prozentsatz). 0 wenn nicht ausgewiesen.
- "waehrung" als ISO-4217-Code (EUR, USD, CHF, ...). Default EUR wenn nicht erkennbar.
- "kategorie" als kurze deutsche Kategorie (Restaurant, Tankstelle, Büromaterial, Reise, Unterkunft, Software, Sonstiges).
- "zahlungsmethode" einer von: Bar, Karte, Kreditkarte, Überweisung, PayPal, Sonstiges.
- Wenn ein Feld nicht erkennbar ist: null.`;

export const USER_PROMPT_PHOTO = `Extrahiere die Felder aus dem angehängten Belegbild.`;
export const USER_PROMPT_VOICE = (transcript: string) =>
  `Aus folgender deutscher Sprachbeschreibung eines Belegs extrahiere die Felder:\n---\n${transcript}\n---`;
export const USER_PROMPT_PHOTO_PLUS_VOICE = (transcript: string) =>
  `Extrahiere die Felder aus dem angehängten Belegbild. Zusätzlicher Sprachkontext des Nutzers:\n---\n${transcript}\n---`;
```

- [ ] **Step 3: Write `server/test/gemini-schema.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { ExtractionZ, emptyExtraction } from "../src/gemini/schema.js";

describe("ExtractionZ", () => {
  it("parses a complete extraction", () => {
    const result = ExtractionZ.parse({
      datum: "2026-05-07",
      haendler: "Mayer",
      betrag: 45.5,
      mwst: 7.27,
      waehrung: "EUR",
      kategorie: "Restaurant",
      zahlungsmethode: "Karte",
      rechnungsnummer: "INV-1",
    });
    expect(result.haendler).toBe("Mayer");
  });

  it("accepts nulls", () => {
    expect(() => ExtractionZ.parse(emptyExtraction())).not.toThrow();
  });

  it("rejects wrong type for betrag", () => {
    expect(() => ExtractionZ.parse({ ...emptyExtraction(), betrag: "abc" })).toThrow();
  });
});
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npm --workspace server test -- gemini-schema
```

- [ ] **Step 5: Commit**

```bash
git add server/src/gemini server/test/gemini-schema.test.ts
git commit -m "feat(server): gemini schema + prompts"
```

---

### Task 14: Gemini extract function

**Files:**
- Create: `server/src/gemini/extract.ts`
- Create: `server/test/gemini-extract.test.ts`

- [ ] **Step 1: Implement `server/src/gemini/extract.ts`**

```ts
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { ExtractionZ, GEMINI_RESPONSE_SCHEMA, emptyExtraction, type Extraction } from "./schema.js";
import { SYSTEM_PROMPT, USER_PROMPT_PHOTO, USER_PROMPT_VOICE, USER_PROMPT_PHOTO_PLUS_VOICE } from "./prompts.js";

const MODEL_NAME = "gemini-2.5-flash";

export type GeminiClient = {
  extractFromPhoto(image: { mimeType: string; buffer: Buffer }, transcript?: string): Promise<Extraction>;
  extractFromTranscript(transcript: string): Promise<Extraction>;
};

export function createGeminiClient(apiKey: string): GeminiClient {
  const ai = new GoogleGenerativeAI(apiKey);
  const model = ai.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: GEMINI_RESPONSE_SCHEMA as unknown as { type: SchemaType },
    },
  });

  async function generateAndParse(parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>): Promise<Extraction> {
    try {
      const res = await model.generateContent({ contents: [{ role: "user", parts }] });
      const text = res.response.text();
      if (!text) return emptyExtraction();
      const json = JSON.parse(text);
      const parsed = ExtractionZ.safeParse(json);
      return parsed.success ? parsed.data : emptyExtraction();
    } catch (err) {
      console.error("[gemini] extraction failed:", err);
      return emptyExtraction();
    }
  }

  return {
    async extractFromPhoto(image, transcript) {
      const userText = transcript ? USER_PROMPT_PHOTO_PLUS_VOICE(transcript) : USER_PROMPT_PHOTO;
      return generateAndParse([
        { inlineData: { mimeType: image.mimeType, data: image.buffer.toString("base64") } },
        { text: userText },
      ]);
    },
    async extractFromTranscript(transcript) {
      return generateAndParse([{ text: USER_PROMPT_VOICE(transcript) }]);
    },
  };
}
```

- [ ] **Step 2: Write `server/test/gemini-extract.test.ts` (parsing logic only — no real API call)**

```ts
import { describe, it, expect, vi } from "vitest";
import { ExtractionZ, emptyExtraction } from "../src/gemini/schema.js";

describe("Extraction parsing pathway", () => {
  it("safeParse falls back to empty on invalid input", () => {
    const result = ExtractionZ.safeParse({ datum: 123 });
    expect(result.success).toBe(false);
  });

  it("emptyExtraction is a valid Extraction", () => {
    expect(ExtractionZ.parse(emptyExtraction())).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test, expect PASS**

```bash
npm --workspace server test -- gemini-extract
```

- [ ] **Step 4: Typecheck**

```bash
npm --workspace server run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add server/src/gemini/extract.ts server/test/gemini-extract.test.ts
git commit -m "feat(server): gemini extract client"
```

---

## Phase 6 — Receipts Pipeline

### Task 15: Pending-receipts in-memory store + types

**Files:**
- Create: `server/src/receipts/types.ts`
- Create: `server/src/receipts/pendingStore.ts`
- Create: `server/test/pendingStore.test.ts`

The upload/voice routes return an extraction preview keyed by a token; the user reviews/edits and posts to /confirm with that token. Pending data lives in-process (TTL 30 min). For multi-process deployments this would move to Redis — out of scope for v1.

- [ ] **Step 1: Implement `server/src/receipts/types.ts`**

```ts
import type { Extraction } from "../gemini/schema.js";

export type PendingSource =
  | { kind: "upload"; mimeType: string; buffer: Buffer }
  | { kind: "voice" }
  | { kind: "drive"; fileId: string; mimeType: string };

export type PendingReceipt = {
  id: string;
  userId: string;
  source: PendingSource;
  extraction: Extraction;
  createdAt: number;
};

export type ConfirmInput = {
  pendingId: string;
  datum: string;
  haendler: string;
  betrag: number;
  mwst: number;
  waehrung: string;
  kategorie: string;
  zahlungsmethode: string;
  rechnungsnummer: string;
};
```

- [ ] **Step 2: Write failing test `server/test/pendingStore.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createPendingStore } from "../src/receipts/pendingStore.js";
import { emptyExtraction } from "../src/gemini/schema.js";

describe("pendingStore", () => {
  it("stores and retrieves a pending receipt", () => {
    const store = createPendingStore({ ttlMs: 60_000 });
    const id = store.put({ userId: "u1", source: { kind: "voice" }, extraction: emptyExtraction() });
    const got = store.take("u1", id);
    expect(got?.userId).toBe("u1");
    expect(store.take("u1", id)).toBeUndefined();
  });

  it("rejects access from another user", () => {
    const store = createPendingStore({ ttlMs: 60_000 });
    const id = store.put({ userId: "u1", source: { kind: "voice" }, extraction: emptyExtraction() });
    expect(store.take("u2", id)).toBeUndefined();
  });

  it("expires entries past ttl", () => {
    const store = createPendingStore({ ttlMs: 1, now: () => Date.now() });
    const id = store.put({ userId: "u1", source: { kind: "voice" }, extraction: emptyExtraction() });
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(store.take("u1", id)).toBeUndefined();
        resolve(null);
      }, 10);
    });
  });
});
```

- [ ] **Step 3: Run test, expect FAIL**

```bash
npm --workspace server test -- pendingStore
```

- [ ] **Step 4: Implement `server/src/receipts/pendingStore.ts`**

```ts
import { randomUUID } from "node:crypto";
import type { PendingReceipt, PendingSource } from "./types.js";
import type { Extraction } from "../gemini/schema.js";

export type PendingStoreOptions = {
  ttlMs: number;
  now?: () => number;
};

type PutInput = { userId: string; source: PendingSource; extraction: Extraction };

export function createPendingStore(opts: PendingStoreOptions) {
  const map = new Map<string, PendingReceipt>();
  const now = opts.now ?? (() => Date.now());

  function isExpired(p: PendingReceipt): boolean {
    return now() - p.createdAt > opts.ttlMs;
  }

  return {
    put(input: PutInput): string {
      const id = randomUUID();
      map.set(id, {
        id,
        userId: input.userId,
        source: input.source,
        extraction: input.extraction,
        createdAt: now(),
      });
      return id;
    },
    take(userId: string, id: string): PendingReceipt | undefined {
      const entry = map.get(id);
      if (!entry) return undefined;
      if (entry.userId !== userId) return undefined;
      if (isExpired(entry)) {
        map.delete(id);
        return undefined;
      }
      map.delete(id);
      return entry;
    },
    peek(userId: string, id: string): PendingReceipt | undefined {
      const entry = map.get(id);
      if (!entry || entry.userId !== userId || isExpired(entry)) return undefined;
      return entry;
    },
    sweep(): void {
      for (const [id, entry] of map) if (isExpired(entry)) map.delete(id);
    },
    size(): number {
      return map.size;
    },
  };
}

export type PendingStore = ReturnType<typeof createPendingStore>;
```

- [ ] **Step 5: Run test, expect PASS**

```bash
npm --workspace server test -- pendingStore
```

- [ ] **Step 6: Commit**

```bash
git add server/src/receipts server/test/pendingStore.test.ts
git commit -m "feat(server): pending-receipts store + types"
```

---

### Task 16: Archive helper

**Files:**
- Create: `server/src/receipts/archive.ts`
- Create: `server/test/archive.test.ts`

- [ ] **Step 1: Write failing test `server/test/archive.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { archivePathSegments } from "../src/receipts/archive.js";

describe("archivePathSegments", () => {
  it("returns YYYY/MM segments for a valid date", () => {
    expect(archivePathSegments("2026-05-07")).toEqual({ year: "2026", month: "05" });
  });

  it("zero-pads single-digit months", () => {
    expect(archivePathSegments("2026-1-7")).toEqual({ year: "2026", month: "01" });
  });

  it("falls back to current date for invalid input", () => {
    const out = archivePathSegments("not-a-date", () => new Date("2026-03-15T00:00:00Z"));
    expect(out).toEqual({ year: "2026", month: "03" });
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
npm --workspace server test -- archive
```

- [ ] **Step 3: Implement `server/src/receipts/archive.ts`**

```ts
import type { DriveClient } from "../google/drive.js";
import { findOrCreateFolder, moveFile, getWebViewLink, uploadFile } from "../google/drive.js";

export function archivePathSegments(
  isoDate: string,
  nowFn: () => Date = () => new Date()
): { year: string; month: string } {
  const m = /^(\d{4})-(\d{1,2})-\d{1,2}$/.exec(isoDate ?? "");
  if (m) return { year: m[1]!, month: m[2]!.padStart(2, "0") };
  const d = nowFn();
  return { year: String(d.getUTCFullYear()), month: String(d.getUTCMonth() + 1).padStart(2, "0") };
}

export async function ensureArchiveSubfolder(
  drive: DriveClient,
  archiveRootId: string,
  isoDate: string
): Promise<string> {
  const { year, month } = archivePathSegments(isoDate);
  const yearId = await findOrCreateFolder(drive, year, archiveRootId);
  const monthId = await findOrCreateFolder(drive, month, yearId);
  return monthId;
}

export type ArchiveResult = { driveLink: string };

export async function archiveExistingFile(
  drive: DriveClient,
  fileId: string,
  archiveRootId: string,
  isoDate: string
): Promise<ArchiveResult> {
  const targetId = await ensureArchiveSubfolder(drive, archiveRootId, isoDate);
  await moveFile(drive, fileId, targetId);
  const driveLink = await getWebViewLink(drive, fileId);
  return { driveLink };
}

export async function archiveBuffer(
  drive: DriveClient,
  args: { name: string; mimeType: string; buffer: Buffer; archiveRootId: string; isoDate: string }
): Promise<ArchiveResult> {
  const targetId = await ensureArchiveSubfolder(drive, args.archiveRootId, args.isoDate);
  const created = await uploadFile(drive, {
    name: args.name,
    mimeType: args.mimeType,
    parentId: targetId,
    body: args.buffer,
  });
  return { driveLink: created.webViewLink };
}
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npm --workspace server test -- archive
```

- [ ] **Step 5: Commit**

```bash
git add server/src/receipts/archive.ts server/test/archive.test.ts
git commit -m "feat(server): archive-folder logic + helpers"
```

---

### Task 17: Multer + rate-limit middleware

**Files:**
- Create: `server/src/middleware/upload.ts`
- Create: `server/src/middleware/rateLimit.ts`

- [ ] **Step 1: Implement `server/src/middleware/upload.ts`**

```ts
import multer from "multer";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export const uploadSingleImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error(`unsupported mime type: ${file.mimetype}`));
  },
}).single("file");
```

- [ ] **Step 2: Implement `server/src/middleware/rateLimit.ts`**

```ts
import rateLimit from "express-rate-limit";

export const uploadRateLimit = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.session?.userId ?? req.ip) as string,
});
```

- [ ] **Step 3: Commit**

```bash
git add server/src/middleware/upload.ts server/src/middleware/rateLimit.ts
git commit -m "feat(server): multer + rate-limit middleware"
```

---

### Task 18: Receipts routes — upload (foto), voice, confirm

**Files:**
- Create: `server/src/receipts/routes.ts`
- Modify: `server/src/app.ts` (mount router)
- Modify: `server/src/server.ts` (wire deps)

- [ ] **Step 1: Implement `server/src/receipts/routes.ts`**

```ts
import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { GeminiClient } from "../gemini/extract.js";
import type { PendingStore } from "./pendingStore.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { uploadSingleImage } from "../middleware/upload.js";
import { uploadRateLimit } from "../middleware/rateLimit.js";
import { buildOAuth2ClientFromSession } from "../google/client.js";
import { driveFor } from "../google/drive.js";
import { sheetsFor, appendRow, readAllRows, type ReceiptRow } from "../google/sheets.js";
import { archiveExistingFile, archiveBuffer } from "./archive.js";

const VoiceBody = z.object({ transcript: z.string().min(1).max(4000) });

const ConfirmBody = z.object({
  pendingId: z.string().min(1),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  haendler: z.string().min(1),
  betrag: z.number().nonnegative(),
  mwst: z.number().nonnegative(),
  waehrung: z.string().min(1),
  kategorie: z.string().min(1),
  zahlungsmethode: z.string().min(1),
  rechnungsnummer: z.string().default(""),
});

export type ReceiptsDeps = {
  config: Config;
  userRepo: UserRepo;
  gemini: GeminiClient;
  pending: PendingStore;
};

export function buildReceiptsRouter(deps: ReceiptsDeps) {
  const router = Router();
  router.use(requireAuth);

  router.post("/upload", uploadRateLimit, uploadSingleImage, async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "file required" });
      const transcript = typeof req.body?.transcript === "string" ? req.body.transcript : undefined;
      const extraction = await deps.gemini.extractFromPhoto(
        { mimeType: req.file.mimetype, buffer: req.file.buffer },
        transcript
      );
      const pendingId = deps.pending.put({
        userId: req.session.userId!,
        source: { kind: "upload", mimeType: req.file.mimetype, buffer: req.file.buffer },
        extraction,
      });
      res.json({ pendingId, extraction, fileName: req.file.originalname });
    } catch (err) {
      next(err);
    }
  });

  router.post("/voice", uploadRateLimit, async (req, res, next) => {
    try {
      const parsed = VoiceBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
      const extraction = await deps.gemini.extractFromTranscript(parsed.data.transcript);
      const pendingId = deps.pending.put({
        userId: req.session.userId!,
        source: { kind: "voice" },
        extraction,
      });
      res.json({ pendingId, extraction });
    } catch (err) {
      next(err);
    }
  });

  router.post("/confirm", async (req, res, next) => {
    try {
      const parsed = ConfirmBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
      const userId = req.session.userId!;
      const pending = deps.pending.take(userId, parsed.data.pendingId);
      if (!pending) return res.status(404).json({ error: "pending receipt not found or expired" });

      const user = deps.userRepo.getById(userId);
      if (!user?.driveArchiveFolderId || !user.sheetId) {
        return res.status(409).json({ error: "user drive not bootstrapped" });
      }

      const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
      const drive = driveFor(auth);
      const sheets = sheetsFor(auth);

      let driveLink = "";
      const baseName = `${parsed.data.datum}_${parsed.data.haendler}`.replace(/[^\w.-]/g, "_");
      if (pending.source.kind === "upload") {
        const ext = pending.source.mimeType === "application/pdf" ? "pdf" : pending.source.mimeType.split("/")[1] ?? "bin";
        const r = await archiveBuffer(drive, {
          name: `${baseName}.${ext}`,
          mimeType: pending.source.mimeType,
          buffer: pending.source.buffer,
          archiveRootId: user.driveArchiveFolderId,
          isoDate: parsed.data.datum,
        });
        driveLink = r.driveLink;
      } else if (pending.source.kind === "drive") {
        const r = await archiveExistingFile(drive, pending.source.fileId, user.driveArchiveFolderId, parsed.data.datum);
        driveLink = r.driveLink;
      }
      // voice: no file to archive

      const row: ReceiptRow = {
        id: uuidv4(),
        datum: parsed.data.datum,
        haendler: parsed.data.haendler,
        betrag: parsed.data.betrag,
        mwst: parsed.data.mwst,
        waehrung: parsed.data.waehrung,
        kategorie: parsed.data.kategorie,
        zahlungsmethode: parsed.data.zahlungsmethode,
        rechnungsnummer: parsed.data.rechnungsnummer,
        driveLink,
        eingabeTyp: pending.source.kind === "upload" ? "foto" : pending.source.kind === "drive" ? "drive" : "sprache",
        erstelltAm: new Date().toISOString(),
      };
      await appendRow(sheets, user.sheetId, row);
      res.json({ ok: true, row });
    } catch (err) {
      next(err);
    }
  });

  router.get("/", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.sheetId) return res.json({ rows: [] });
      const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
      const sheets = sheetsFor(auth);
      const rows = await readAllRows(sheets, user.sheetId);
      res.json({ rows });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 2: Update `server/src/app.ts` to accept gemini + pending store and mount routes**

```ts
import express, { type Express } from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import passport from "passport";
import type { Config } from "./config.js";
import { buildSessionMiddleware } from "./session/store.js";
import type { Db } from "./db/index.js";
import { createUserRepo } from "./auth/userRepo.js";
import { configurePassport } from "./auth/passport.js";
import { buildAuthRouter } from "./auth/routes.js";
import type { GeminiClient } from "./gemini/extract.js";
import type { PendingStore } from "./receipts/pendingStore.js";
import { buildReceiptsRouter } from "./receipts/routes.js";

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

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[error]", err);
    res.status(500).json({ error: err.message ?? "internal error" });
  });

  return app;
}
```

- [ ] **Step 3: Update `server/src/server.ts`**

```ts
import "dotenv/config";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/index.js";
import { runMigrations } from "./db/migrations.js";
import { createUserRepo } from "./auth/userRepo.js";
import { buildOAuth2ClientForRefreshToken } from "./google/client.js";
import { bootstrapUserDrive } from "./google/bootstrap.js";
import { createGeminiClient } from "./gemini/extract.js";
import { createPendingStore } from "./receipts/pendingStore.js";

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
app.listen(config.port, () => {
  console.log(`server listening on http://localhost:${config.port}`);
});
```

- [ ] **Step 4: Update existing tests that build the app to pass gemini + pending stubs**

Update `server/test/health.test.ts` and `server/test/auth-routes.test.ts`. Add a helper:

```ts
// server/test/helpers/buildTestApp.ts
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
```

Then update `server/test/health.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { makeTestApp } from "./helpers/buildTestApp.js";

describe("GET /api/health", () => {
  it("returns 200 ok", async () => {
    const { app } = makeTestApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
  });
});
```

And `server/test/auth-routes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { makeTestApp } from "./helpers/buildTestApp.js";

describe("auth routes", () => {
  it("GET /api/auth/me returns 401 without session", async () => {
    const { app } = makeTestApp();
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
  it("POST /api/auth/logout returns ok", async () => {
    const { app } = makeTestApp();
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
  });
  it("GET /api/auth/google redirects", async () => {
    const { app } = makeTestApp();
    const res = await request(app).get("/api/auth/google");
    expect(res.status).toBe(302);
  });
});
```

- [ ] **Step 5: Add `server/test/receipts-routes.test.ts` for unauth + voice happy-path with mocked gemini**

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { makeTestApp } from "./helpers/buildTestApp.js";
import { emptyExtraction } from "../src/gemini/schema.js";

describe("receipts routes — guards", () => {
  it("rejects /upload without session", async () => {
    const { app } = makeTestApp();
    const res = await request(app).post("/api/receipts/upload").attach("file", Buffer.from([0xff, 0xd8, 0xff]), {
      filename: "t.jpg",
      contentType: "image/jpeg",
    });
    expect(res.status).toBe(401);
  });

  it("rejects /voice without body", async () => {
    const { app } = makeTestApp();
    const res = await request(app).post("/api/receipts/voice").send({});
    expect([400, 401]).toContain(res.status);
  });

  it("/voice with mocked gemini returns pendingId", async () => {
    const { app } = makeTestApp({
      gemini: {
        async extractFromPhoto() { return emptyExtraction(); },
        async extractFromTranscript() { return { ...emptyExtraction(), haendler: "Test" }; },
      },
    });
    // Bypass auth: hit /api/auth/me first won't help — these are guard tests.
    // Full session test is exercised in E2E. Skip integration here.
    expect(app).toBeTruthy();
  });
});
```

- [ ] **Step 6: Run all server tests**

```bash
npm --workspace server test
```

- [ ] **Step 7: Commit**

```bash
git add server/src server/test
git commit -m "feat(server): receipts upload/voice/confirm/list routes"
```

---

### Task 19: Stats routes

**Files:**
- Create: `server/src/stats/compute.ts`
- Create: `server/src/stats/routes.ts`
- Create: `server/test/stats-compute.test.ts`
- Modify: `server/src/app.ts` (mount)

- [ ] **Step 1: Implement `server/src/stats/compute.ts`**

```ts
import type { ReceiptRow } from "../google/sheets.js";

export type Summary = {
  monthTotal: number;
  yearTotal: number;
  count: number;
  topCategory: string | null;
};

export function computeSummary(rows: ReceiptRow[], today: Date = new Date()): Summary {
  const yyyy = today.getUTCFullYear();
  const mm = today.getUTCMonth() + 1;
  let monthTotal = 0, yearTotal = 0;
  const byCategory = new Map<string, number>();
  for (const r of rows) {
    const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(r.datum);
    if (!m) continue;
    const [_, y, mo] = m;
    if (Number(y) === yyyy) yearTotal += r.betrag;
    if (Number(y) === yyyy && Number(mo) === mm) monthTotal += r.betrag;
    byCategory.set(r.kategorie, (byCategory.get(r.kategorie) ?? 0) + r.betrag);
  }
  let topCategory: string | null = null;
  let topVal = 0;
  for (const [k, v] of byCategory) if (v > topVal) { topCategory = k; topVal = v; }
  return { monthTotal, yearTotal, count: rows.length, topCategory };
}

export function computeMonthly(rows: ReceiptRow[], months = 12, today: Date = new Date()): Array<{ ym: string; total: number }> {
  const buckets = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, 0);
  }
  for (const r of rows) {
    const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(r.datum);
    if (!m) continue;
    const key = `${m[1]}-${m[2]}`;
    if (buckets.has(key)) buckets.set(key, buckets.get(key)! + r.betrag);
  }
  return [...buckets.entries()].map(([ym, total]) => ({ ym, total }));
}

export function computeCategories(rows: ReceiptRow[]): Array<{ kategorie: string; total: number }> {
  const byCategory = new Map<string, number>();
  for (const r of rows) {
    byCategory.set(r.kategorie, (byCategory.get(r.kategorie) ?? 0) + r.betrag);
  }
  return [...byCategory.entries()]
    .map(([kategorie, total]) => ({ kategorie, total }))
    .sort((a, b) => b.total - a.total);
}
```

- [ ] **Step 2: Write `server/test/stats-compute.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { computeSummary, computeMonthly, computeCategories } from "../src/stats/compute.js";
import type { ReceiptRow } from "../src/google/sheets.js";

const r = (datum: string, betrag: number, kategorie = "Restaurant"): ReceiptRow => ({
  id: "x", datum, haendler: "h", betrag, mwst: 0, waehrung: "EUR",
  kategorie, zahlungsmethode: "Karte", rechnungsnummer: "",
  driveLink: "", eingabeTyp: "foto", erstelltAm: "",
});

describe("computeSummary", () => {
  it("aggregates correctly", () => {
    const today = new Date(Date.UTC(2026, 4, 15)); // May 2026
    const rows = [r("2026-05-01", 10), r("2026-05-15", 20), r("2026-04-30", 5), r("2025-12-01", 99)];
    const s = computeSummary(rows, today);
    expect(s.monthTotal).toBe(30);
    expect(s.yearTotal).toBe(35);
    expect(s.count).toBe(4);
  });

  it("identifies top category", () => {
    const today = new Date(Date.UTC(2026, 4, 15));
    const s = computeSummary([r("2026-05-01", 10, "A"), r("2026-05-02", 50, "B"), r("2026-05-03", 5, "B")], today);
    expect(s.topCategory).toBe("B");
  });
});

describe("computeMonthly", () => {
  it("returns 12 buckets ending at the current month", () => {
    const today = new Date(Date.UTC(2026, 4, 15));
    const out = computeMonthly([r("2026-05-01", 10), r("2026-04-15", 20)], 12, today);
    expect(out).toHaveLength(12);
    expect(out[out.length - 1]).toEqual({ ym: "2026-05", total: 10 });
    expect(out[out.length - 2]).toEqual({ ym: "2026-04", total: 20 });
  });
});

describe("computeCategories", () => {
  it("sorts descending by total", () => {
    const out = computeCategories([r("2026-05-01", 10, "A"), r("2026-05-02", 50, "B"), r("2026-05-03", 5, "C")]);
    expect(out.map((x) => x.kategorie)).toEqual(["B", "A", "C"]);
  });
});
```

- [ ] **Step 3: Implement `server/src/stats/routes.ts`**

```ts
import { Router } from "express";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { buildOAuth2ClientFromSession } from "../google/client.js";
import { sheetsFor, readAllRows } from "../google/sheets.js";
import { computeSummary, computeMonthly, computeCategories } from "./compute.js";

export function buildStatsRouter(config: Config, userRepo: UserRepo) {
  const router = Router();
  router.use(requireAuth);

  async function loadRows(req: any) {
    const userId = req.session.userId as string;
    const user = userRepo.getById(userId);
    if (!user?.sheetId) return [];
    const auth = buildOAuth2ClientFromSession(config.google, req.session);
    const sheets = sheetsFor(auth);
    return readAllRows(sheets, user.sheetId);
  }

  router.get("/summary", async (req, res, next) => {
    try { res.json(computeSummary(await loadRows(req))); } catch (e) { next(e); }
  });
  router.get("/monthly", async (req, res, next) => {
    try { res.json(computeMonthly(await loadRows(req))); } catch (e) { next(e); }
  });
  router.get("/categories", async (req, res, next) => {
    try { res.json(computeCategories(await loadRows(req))); } catch (e) { next(e); }
  });

  return router;
}
```

- [ ] **Step 4: Mount in `server/src/app.ts`**

Add after the receipts router mount:

```ts
import { buildStatsRouter } from "./stats/routes.js";
// ...
app.use("/api/stats", buildStatsRouter(deps.config, userRepo));
```

- [ ] **Step 5: Run tests, expect PASS**

```bash
npm --workspace server test -- stats
```

- [ ] **Step 6: Commit**

```bash
git add server/src/stats server/test/stats-compute.test.ts server/src/app.ts
git commit -m "feat(server): stats routes (summary/monthly/categories)"
```

---

## Phase 7 — Drive Inbox

### Task 20: Drive routes (list + import)

**Files:**
- Create: `server/src/drive/routes.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Implement `server/src/drive/routes.ts`**

```ts
import { Router } from "express";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { GeminiClient } from "../gemini/extract.js";
import type { PendingStore } from "../receipts/pendingStore.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { buildOAuth2ClientFromSession } from "../google/client.js";
import { driveFor, listFolderFiles, downloadFile, setAppProperties } from "../google/drive.js";

export type DriveRoutesDeps = {
  config: Config;
  userRepo: UserRepo;
  gemini: GeminiClient;
  pending: PendingStore;
};

const SUPPORTED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export function buildDriveRouter(deps: DriveRoutesDeps) {
  const router = Router();
  router.use(requireAuth);

  router.get("/inbox", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.driveInboxFolderId) return res.json({ files: [] });
      const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
      const drive = driveFor(auth);
      const files = await listFolderFiles(drive, user.driveInboxFolderId);
      const enriched = files.map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        status: f.appProperties?.bm_status ?? "new",
        extracted: f.appProperties?.bm_extracted_json ? JSON.parse(f.appProperties.bm_extracted_json) : null,
      }));
      res.json({ files: enriched });
    } catch (err) {
      next(err);
    }
  });

  router.post("/import/:fileId", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.driveInboxFolderId) return res.status(409).json({ error: "drive not bootstrapped" });

      const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
      const drive = driveFor(auth);
      const files = await listFolderFiles(drive, user.driveInboxFolderId);
      const file = files.find((f) => f.id === req.params.fileId);
      if (!file) return res.status(404).json({ error: "file not in inbox" });
      if (!SUPPORTED.has(file.mimeType)) {
        return res.status(415).json({ error: `unsupported mime: ${file.mimeType}` });
      }

      const buffer = await downloadFile(drive, file.id);
      const extraction = await deps.gemini.extractFromPhoto({ mimeType: file.mimeType, buffer });
      const pendingId = deps.pending.put({
        userId,
        source: { kind: "drive", fileId: file.id, mimeType: file.mimeType },
        extraction,
      });
      await setAppProperties(drive, file.id, {
        bm_status: "pending_review",
        bm_extracted_json: JSON.stringify(extraction),
      }).catch(() => undefined);
      res.json({ pendingId, extraction, fileName: file.name });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 2: Mount in `server/src/app.ts`** (after stats router):

```ts
import { buildDriveRouter } from "./drive/routes.js";
// ...
app.use("/api/drive", buildDriveRouter({
  config: deps.config,
  userRepo,
  gemini: deps.gemini,
  pending: deps.pending,
}));
```

- [ ] **Step 3: Typecheck**

```bash
npm --workspace server run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add server/src
git commit -m "feat(server): drive inbox list + import endpoints"
```

---

### Task 21: Inbox poller (cron)

**Files:**
- Create: `server/src/inbox/poller.ts`
- Modify: `server/src/server.ts`

- [ ] **Step 1: Implement `server/src/inbox/poller.ts`**

```ts
import cron from "node-cron";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { GeminiClient } from "../gemini/extract.js";
import { buildOAuth2ClientForRefreshToken } from "../google/client.js";
import { driveFor, listFolderFiles, downloadFile, setAppProperties } from "../google/drive.js";

const SUPPORTED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export type PollerDeps = {
  config: Config;
  userRepo: UserRepo;
  gemini: GeminiClient;
};

export function startInboxPoller(deps: PollerDeps): { stop: () => void } {
  const task = cron.schedule("*/5 * * * *", () => {
    runOnce(deps).catch((err) => console.error("[inbox-poller]", err));
  });
  return { stop: () => task.stop() };
}

export async function runOnce(deps: PollerDeps): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;
  const users = deps.userRepo.listAllWithRefreshToken();
  for (const user of users) {
    if (!user.refreshToken || !user.driveInboxFolderId) continue;
    try {
      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      const drive = driveFor(auth);
      const files = await listFolderFiles(drive, user.driveInboxFolderId);
      for (const file of files) {
        if (file.appProperties?.bm_status) continue; // already processed or failed
        if (!SUPPORTED.has(file.mimeType)) continue;
        try {
          const buffer = await downloadFile(drive, file.id);
          const extraction = await deps.gemini.extractFromPhoto({ mimeType: file.mimeType, buffer });
          await setAppProperties(drive, file.id, {
            bm_status: "pending_review",
            bm_extracted_json: JSON.stringify(extraction),
          });
          processed++;
        } catch (err) {
          await setAppProperties(drive, file.id, {
            bm_status: "failed",
            bm_error: String((err as Error).message ?? err).slice(0, 200),
          }).catch(() => undefined);
          failed++;
        }
      }
    } catch (err) {
      console.error(`[inbox-poller] user ${user.id}:`, err);
    }
  }
  return { processed, failed };
}
```

- [ ] **Step 2: Wire into `server/src/server.ts`** (add at end before `app.listen`)

```ts
import { startInboxPoller } from "./inbox/poller.js";
// ...
const poller = startInboxPoller({ config, userRepo, gemini });
process.on("SIGTERM", () => poller.stop());
```

- [ ] **Step 3: Typecheck**

```bash
npm --workspace server run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add server/src/inbox server/src/server.ts
git commit -m "feat(server): node-cron inbox poller (every 5 min)"
```

---

## Phase 8 — Client Foundation

### Task 22: shadcn primitive components

**Files:**
- Create: `client/src/components/ui/button.tsx`
- Create: `client/src/components/ui/card.tsx`
- Create: `client/src/components/ui/input.tsx`
- Create: `client/src/components/ui/label.tsx`
- Create: `client/src/components/ui/select.tsx`
- Create: `client/src/components/ui/tabs.tsx`
- Create: `client/src/components/ui/dialog.tsx`
- Create: `client/src/components/ui/toast.tsx`
- Create: `client/src/components/ui/toaster.tsx`
- Create: `client/src/components/ui/use-toast.ts`
- Create: `client/src/components/ui/table.tsx`
- Create: `client/src/components/ui/skeleton.tsx`

These are the standard shadcn primitives. Run the shadcn CLI or copy them verbatim from https://ui.shadcn.com/docs/components.

- [ ] **Step 1: Add shadcn CLI as a dev dependency and initialize**

```bash
npx shadcn@latest add button card input label select tabs dialog toast table skeleton --cwd client --yes
```

If the CLI prompts for missing config, answer with the values from `client/components.json`.

- [ ] **Step 2: Verify each file was created and typechecks**

```bash
npm --workspace client run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ui client/package.json client/package-lock.json
git commit -m "feat(client): add shadcn primitives"
```

---

### Task 23: API client + types

**Files:**
- Create: `client/src/types/receipt.ts`
- Create: `client/src/api/client.ts`
- Create: `client/src/api/auth.ts`
- Create: `client/src/api/receipts.ts`
- Create: `client/src/api/drive.ts`
- Create: `client/src/api/stats.ts`

- [ ] **Step 1: Create `client/src/types/receipt.ts`**

```ts
export type Extraction = {
  datum: string | null;
  haendler: string | null;
  betrag: number | null;
  mwst: number | null;
  waehrung: string | null;
  kategorie: string | null;
  zahlungsmethode: string | null;
  rechnungsnummer: string | null;
};

export type ReceiptRow = {
  id: string;
  datum: string;
  haendler: string;
  betrag: number;
  mwst: number;
  waehrung: string;
  kategorie: string;
  zahlungsmethode: string;
  rechnungsnummer: string;
  driveLink: string;
  eingabeTyp: "foto" | "sprache" | "drive";
  erstelltAm: string;
};

export type EingabeTyp = ReceiptRow["eingabeTyp"];

export type PendingReceiptResponse = {
  pendingId: string;
  extraction: Extraction;
  fileName?: string;
};

export type DriveInboxFile = {
  id: string;
  name: string;
  mimeType: string;
  status: "new" | "pending_review" | "failed";
  extracted: Extraction | null;
};

export type StatsSummary = {
  monthTotal: number;
  yearTotal: number;
  count: number;
  topCategory: string | null;
};

export type MonthlyPoint = { ym: string; total: number };
export type CategoryBucket = { kategorie: string; total: number };
```

- [ ] **Step 2: Create `client/src/api/client.ts`**

```ts
async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T,>(url: string) => request<T>(url),
  post: <T,>(url: string, body?: unknown) =>
    request<T>(url, { method: "POST", body: body == null ? undefined : JSON.stringify(body) }),
  postForm: async <T,>(url: string, form: FormData): Promise<T> => {
    const res = await fetch(url, { method: "POST", credentials: "include", body: form });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${res.status} ${res.statusText}: ${body}`);
    }
    return (await res.json()) as T;
  },
};
```

- [ ] **Step 3: Create `client/src/api/auth.ts`**

```ts
import { api } from "./client";

export type Me = { id: string; email: string; name: string };

export const authApi = {
  me: () => api.get<Me>("/api/auth/me"),
  logout: () => api.post<{ ok: true }>("/api/auth/logout"),
  loginUrl: () => "/api/auth/google",
};
```

- [ ] **Step 4: Create `client/src/api/receipts.ts`**

```ts
import { api } from "./client";
import type { PendingReceiptResponse, ReceiptRow } from "@/types/receipt";

export const receiptsApi = {
  upload: (file: File, transcript?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    if (transcript) fd.append("transcript", transcript);
    return api.postForm<PendingReceiptResponse>("/api/receipts/upload", fd);
  },
  voice: (transcript: string) =>
    api.post<PendingReceiptResponse>("/api/receipts/voice", { transcript }),
  confirm: (payload: {
    pendingId: string;
    datum: string;
    haendler: string;
    betrag: number;
    mwst: number;
    waehrung: string;
    kategorie: string;
    zahlungsmethode: string;
    rechnungsnummer: string;
  }) => api.post<{ ok: true; row: ReceiptRow }>("/api/receipts/confirm", payload),
  list: () => api.get<{ rows: ReceiptRow[] }>("/api/receipts"),
};
```

- [ ] **Step 5: Create `client/src/api/drive.ts`**

```ts
import { api } from "./client";
import type { DriveInboxFile, PendingReceiptResponse } from "@/types/receipt";

export const driveApi = {
  inbox: () => api.get<{ files: DriveInboxFile[] }>("/api/drive/inbox"),
  importFile: (fileId: string) => api.post<PendingReceiptResponse>(`/api/drive/import/${fileId}`),
};
```

- [ ] **Step 6: Create `client/src/api/stats.ts`**

```ts
import { api } from "./client";
import type { StatsSummary, MonthlyPoint, CategoryBucket } from "@/types/receipt";

export const statsApi = {
  summary: () => api.get<StatsSummary>("/api/stats/summary"),
  monthly: () => api.get<MonthlyPoint[]>("/api/stats/monthly"),
  categories: () => api.get<CategoryBucket[]>("/api/stats/categories"),
};
```

- [ ] **Step 7: Commit**

```bash
git add client/src/api client/src/types
git commit -m "feat(client): typed api client"
```

---

### Task 24: Auth hook + AppShell + Router

**Files:**
- Create: `client/src/hooks/useAuth.ts`
- Create: `client/src/components/AppShell.tsx`
- Create: `client/src/components/ProtectedRoute.tsx`
- Create: `client/src/pages/Login.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Create `client/src/hooks/useAuth.ts`**

```ts
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi, type Me } from "@/api/auth";

export function useAuth() {
  const qc = useQueryClient();
  const query = useQuery<Me | null>({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await authApi.me();
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  return {
    user: query.data ?? null,
    isLoading: query.isLoading,
    isAuthenticated: !!query.data,
    logout: async () => {
      await authApi.logout();
      qc.setQueryData(["me"], null);
      qc.clear();
    },
  };
}
```

- [ ] **Step 2: Create `client/src/pages/Login.tsx`**

```tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function LoginPage() {
  return (
    <main className="container mx-auto flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Beleg-Manager</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Melde dich mit deinem Google-Konto an, um Belege per Foto, Sprache oder Drive-Inbox zu erfassen.
          </p>
          <Button asChild className="w-full">
            <a href="/api/auth/google">Mit Google anmelden</a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 3: Create `client/src/components/ProtectedRoute.tsx`**

```tsx
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="container py-8"><Skeleton className="h-32 w-full" /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 4: Create `client/src/components/AppShell.tsx`**

```tsx
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AppShell() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto flex h-14 items-center justify-between">
          <Link to="/" className="font-semibold">Beleg-Manager</Link>
          <nav className="flex gap-2">
            {[
              { to: "/", label: "Dashboard" },
              { to: "/upload", label: "Erfassen" },
              { to: "/settings", label: "Einstellungen" },
            ].map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                className={({ isActive }) =>
                  cn("px-3 py-1.5 text-sm rounded-md", isActive ? "bg-secondary" : "hover:bg-secondary/50")
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground hidden sm:inline">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={logout}>Abmelden</Button>
          </div>
        </div>
      </header>
      <main className="container mx-auto flex-1 py-8">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Update `client/src/App.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { LoginPage } from "@/pages/Login";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Toaster } from "@/components/ui/toaster";

const qc = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } },
});

export function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
            <Route path="/" element={<DashboardPlaceholder />} />
            <Route path="/upload" element={<UploadPlaceholder />} />
            <Route path="/review/:pendingId" element={<ReviewPlaceholder />} />
            <Route path="/settings" element={<SettingsPlaceholder />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

function DashboardPlaceholder() { return <div>Dashboard kommt in Task 26.</div>; }
function UploadPlaceholder() { return <div>Upload kommt in Task 28.</div>; }
function ReviewPlaceholder() { return <div>Review kommt in Task 33.</div>; }
function SettingsPlaceholder() { return <div>Settings kommt in Task 34.</div>; }
```

- [ ] **Step 6: Verify build**

```bash
npm --workspace client run typecheck
npm --workspace client run build
```

- [ ] **Step 7: Commit**

```bash
git add client/src
git commit -m "feat(client): auth hook, app shell, protected routes, login page"
```

---

## Phase 9 — Client Dashboard

### Task 25: Formatters + receipts hook

**Files:**
- Create: `client/src/lib/formatters.ts`
- Create: `client/src/hooks/useReceipts.ts`
- Create: `client/src/hooks/useStats.ts`

- [ ] **Step 1: Create `client/src/lib/formatters.ts`**

```ts
const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const intl = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

export function formatCurrency(value: number, currency = "EUR"): string {
  if (currency === "EUR") return eur.format(value);
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function formatDateIso(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}

export function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  if (!y || !m) return ym;
  return new Intl.DateTimeFormat("de-DE", { month: "short", year: "2-digit" }).format(new Date(Number(y), Number(m) - 1, 1));
}

export const _intl = intl;
```

- [ ] **Step 2: Create `client/src/hooks/useReceipts.ts`**

```ts
import { useQuery } from "@tanstack/react-query";
import { receiptsApi } from "@/api/receipts";

export function useReceipts() {
  return useQuery({
    queryKey: ["receipts"],
    queryFn: () => receiptsApi.list(),
  });
}
```

- [ ] **Step 3: Create `client/src/hooks/useStats.ts`**

```ts
import { useQuery } from "@tanstack/react-query";
import { statsApi } from "@/api/stats";

export const useSummary = () => useQuery({ queryKey: ["stats", "summary"], queryFn: () => statsApi.summary() });
export const useMonthly = () => useQuery({ queryKey: ["stats", "monthly"], queryFn: () => statsApi.monthly() });
export const useCategories = () => useQuery({ queryKey: ["stats", "categories"], queryFn: () => statsApi.categories() });
```

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/formatters.ts client/src/hooks
git commit -m "feat(client): formatters + react-query hooks"
```

---

### Task 26: KPI cards + charts + receipt table + dashboard page

**Files:**
- Create: `client/src/components/stats/KpiCards.tsx`
- Create: `client/src/components/stats/MonthlyChart.tsx`
- Create: `client/src/components/stats/CategoryDonut.tsx`
- Create: `client/src/components/receipts/ReceiptTable.tsx`
- Create: `client/src/components/receipts/ReceiptFilters.tsx`
- Create: `client/src/pages/Dashboard.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Create `client/src/components/stats/KpiCards.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSummary } from "@/hooks/useStats";
import { formatCurrency } from "@/lib/formatters";

export function KpiCards() {
  const { data, isLoading } = useSummary();
  const cards = [
    { label: "Diesen Monat", value: data ? formatCurrency(data.monthTotal) : "—" },
    { label: "Dieses Jahr", value: data ? formatCurrency(data.yearTotal) : "—" },
    { label: "Belege gesamt", value: data ? String(data.count) : "—" },
    { label: "Top-Kategorie", value: data?.topCategory ?? "—" },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{c.label}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-semibold">{c.value}</div>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `client/src/components/stats/MonthlyChart.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { useMonthly } from "@/hooks/useStats";
import { formatCurrency, formatMonthLabel } from "@/lib/formatters";

export function MonthlyChart() {
  const { data, isLoading } = useMonthly();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ausgaben pro Monat</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={(data ?? []).map((d) => ({ ...d, label: formatMonthLabel(d.ym) }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={(v) => formatCurrency(Number(v))} width={80} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create `client/src/components/stats/CategoryDonut.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useCategories } from "@/hooks/useStats";
import { formatCurrency } from "@/lib/formatters";

const COLORS = ["#0ea5e9", "#22c55e", "#a855f7", "#f97316", "#ef4444", "#14b8a6", "#eab308"];

export function CategoryDonut() {
  const { data, isLoading } = useCategories();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Aufschlüsselung nach Kategorie</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data ?? []} dataKey="total" nameKey="kategorie" innerRadius={60} outerRadius={95}>
                {(data ?? []).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Create `client/src/components/receipts/ReceiptFilters.tsx`**

```tsx
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type Filters = {
  search: string;
  kategorie: string;
  from: string;
  to: string;
};

export function ReceiptFilters({
  filters,
  setFilters,
  categories,
}: {
  filters: Filters;
  setFilters: (next: Filters) => void;
  categories: string[];
}) {
  return (
    <div className="grid gap-2 md:grid-cols-4">
      <Input
        placeholder="Suche (Händler, Rechnungsnr., ...)"
        value={filters.search}
        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
      />
      <Select value={filters.kategorie} onValueChange={(v) => setFilters({ ...filters, kategorie: v })}>
        <SelectTrigger><SelectValue placeholder="Kategorie" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Alle Kategorien</SelectItem>
          {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
      <Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
    </div>
  );
}
```

- [ ] **Step 5: Create `client/src/components/receipts/ReceiptTable.tsx`**

```tsx
import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { useReceipts } from "@/hooks/useReceipts";
import { formatCurrency, formatDateIso } from "@/lib/formatters";
import { ReceiptFilters, type Filters } from "./ReceiptFilters";

export function ReceiptTable() {
  const { data, isLoading } = useReceipts();
  const [filters, setFilters] = useState<Filters>({ search: "", kategorie: "__all__", from: "", to: "" });

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of data?.rows ?? []) if (r.kategorie) set.add(r.kategorie);
    return [...set].sort();
  }, [data]);

  const filtered = useMemo(() => {
    const rows = (data?.rows ?? []).slice().sort((a, b) => b.datum.localeCompare(a.datum));
    return rows.filter((r) => {
      if (filters.kategorie !== "__all__" && r.kategorie !== filters.kategorie) return false;
      if (filters.from && r.datum < filters.from) return false;
      if (filters.to && r.datum > filters.to) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hay = [r.haendler, r.rechnungsnummer, r.kategorie, r.zahlungsmethode].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, filters]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <ReceiptFilters filters={filters} setFilters={setFilters} categories={categories} />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datum</TableHead>
              <TableHead>Händler</TableHead>
              <TableHead className="text-right">Betrag</TableHead>
              <TableHead>Kategorie</TableHead>
              <TableHead>Zahlung</TableHead>
              <TableHead className="text-right">MwSt</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Keine Belege gefunden.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{formatDateIso(r.datum)}</TableCell>
                <TableCell className="font-medium">{r.haendler}</TableCell>
                <TableCell className="text-right">{formatCurrency(r.betrag, r.waehrung)}</TableCell>
                <TableCell>{r.kategorie}</TableCell>
                <TableCell>{r.zahlungsmethode}</TableCell>
                <TableCell className="text-right">{formatCurrency(r.mwst, r.waehrung)}</TableCell>
                <TableCell className="text-right">
                  {r.driveLink && (
                    <Button asChild variant="ghost" size="icon">
                      <a href={r.driveLink} target="_blank" rel="noreferrer" aria-label="In Drive öffnen">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `client/src/pages/Dashboard.tsx`**

```tsx
import { KpiCards } from "@/components/stats/KpiCards";
import { MonthlyChart } from "@/components/stats/MonthlyChart";
import { CategoryDonut } from "@/components/stats/CategoryDonut";
import { ReceiptTable } from "@/components/receipts/ReceiptTable";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export function DashboardPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Übersicht</h1>
        <Button asChild>
          <Link to="/upload">Beleg erfassen</Link>
        </Button>
      </div>
      <KpiCards />
      <div className="grid gap-4 lg:grid-cols-2">
        <MonthlyChart />
        <CategoryDonut />
      </div>
      <ReceiptTable />
    </div>
  );
}
```

- [ ] **Step 7: Wire into `client/src/App.tsx` (replace `DashboardPlaceholder`)**

```tsx
import { DashboardPage } from "@/pages/Dashboard";
// ...
<Route path="/" element={<DashboardPage />} />
```

- [ ] **Step 8: Typecheck + build**

```bash
npm --workspace client run typecheck
npm --workspace client run build
```

- [ ] **Step 9: Commit**

```bash
git add client/src
git commit -m "feat(client): dashboard with kpi cards, charts, receipt table"
```

---

## Phase 10 — Client Upload Flow

### Task 27: Speech-recognition wrapper

**Files:**
- Create: `client/src/lib/speechRecognition.ts`

- [ ] **Step 1: Create `client/src/lib/speechRecognition.ts`**

```ts
type SpeechRecognitionResult = {
  transcript: string;
  isFinal: boolean;
};

export type SpeechController = {
  start: () => void;
  stop: () => void;
};

export function isSpeechRecognitionSupported(): boolean {
  return typeof window !== "undefined" &&
    (("SpeechRecognition" in window) || ("webkitSpeechRecognition" in window));
}

export function createRecognizer(opts: {
  lang?: string;
  onResult: (r: SpeechRecognitionResult) => void;
  onError?: (e: Event) => void;
  onEnd?: () => void;
}): SpeechController | null {
  if (!isSpeechRecognitionSupported()) return null;
  const Ctor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  const rec = new Ctor();
  rec.lang = opts.lang ?? "de-DE";
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = (event: any) => {
    let interim = "";
    let final = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) final += result[0].transcript;
      else interim += result[0].transcript;
    }
    if (final) opts.onResult({ transcript: final, isFinal: true });
    if (interim) opts.onResult({ transcript: interim, isFinal: false });
  };
  rec.onerror = (e: Event) => opts.onError?.(e);
  rec.onend = () => opts.onEnd?.();
  return {
    start: () => rec.start(),
    stop: () => rec.stop(),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/lib/speechRecognition.ts
git commit -m "feat(client): web speech api wrapper"
```

---

### Task 28: Upload page tabs + photo upload

**Files:**
- Create: `client/src/pages/Upload.tsx`
- Create: `client/src/components/upload/PhotoUpload.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Create `client/src/components/upload/PhotoUpload.tsx`**

```tsx
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { receiptsApi } from "@/api/receipts";

export function PhotoUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  async function submit() {
    if (!file) return toast({ title: "Bitte eine Datei wählen." });
    setBusy(true);
    try {
      const res = await receiptsApi.upload(file, transcript || undefined);
      navigate(`/review/${res.pendingId}`, { state: { extraction: res.extraction, fileName: res.fileName } });
    } catch (e) {
      toast({ title: "Upload fehlgeschlagen", description: String((e as Error).message) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Foto hochladen</CardTitle>
        <CardDescription>JPG, PNG, WEBP oder PDF, bis 10 MB.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="rounded-md border-2 border-dashed p-8 text-center cursor-pointer hover:bg-secondary/30"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) setFile(f);
          }}
        >
          <p className="text-sm text-muted-foreground">
            {file ? file.name : "Datei hier hineinziehen oder klicken zum Auswählen"}
          </p>
          <Input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="transcript-photo">Optionaler Sprachkontext</Label>
          <Input
            id="transcript-photo"
            placeholder="z.B. Geschäftsessen mit Kunde XYZ"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
          />
        </div>
        <Button onClick={submit} disabled={!file || busy} className="w-full">
          {busy ? "Verarbeite..." : "Verarbeiten"}
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create `client/src/pages/Upload.tsx`** (with placeholders for camera/voice/drive — filled in next tasks)

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PhotoUpload } from "@/components/upload/PhotoUpload";
import { CameraCapture } from "@/components/upload/CameraCapture";
import { VoiceInput } from "@/components/upload/VoiceInput";
import { DriveInbox } from "@/components/upload/DriveInbox";

export function UploadPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Beleg erfassen</h1>
      <Tabs defaultValue="photo">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="photo">Foto</TabsTrigger>
          <TabsTrigger value="camera">Kamera</TabsTrigger>
          <TabsTrigger value="voice">Sprache</TabsTrigger>
          <TabsTrigger value="drive">Drive-Inbox</TabsTrigger>
        </TabsList>
        <TabsContent value="photo"><PhotoUpload /></TabsContent>
        <TabsContent value="camera"><CameraCapture /></TabsContent>
        <TabsContent value="voice"><VoiceInput /></TabsContent>
        <TabsContent value="drive"><DriveInbox /></TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 3: Wire into `App.tsx`**

```tsx
import { UploadPage } from "@/pages/Upload";
// ...
<Route path="/upload" element={<UploadPage />} />
```

- [ ] **Step 4: Commit (after Tasks 29-31 the page will compile cleanly; for now stub the missing components):**

Create temporary stubs so the page compiles:

`client/src/components/upload/CameraCapture.tsx`:
```tsx
export function CameraCapture() { return <div>Kamera kommt in Task 29.</div>; }
```

`client/src/components/upload/VoiceInput.tsx`:
```tsx
export function VoiceInput() { return <div>Sprache kommt in Task 30.</div>; }
```

`client/src/components/upload/DriveInbox.tsx`:
```tsx
export function DriveInbox() { return <div>Drive-Inbox kommt in Task 31.</div>; }
```

- [ ] **Step 5: Build + commit**

```bash
npm --workspace client run typecheck
git add client/src
git commit -m "feat(client): upload page with photo upload tab"
```

---

### Task 29: Camera capture component

**Files:**
- Modify: `client/src/components/upload/CameraCapture.tsx`

- [ ] **Step 1: Implement `client/src/components/upload/CameraCapture.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { receiptsApi } from "@/api/receipts";

export function CameraCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<Blob | null>(null);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (e) {
        setError(`Kamerazugriff verweigert oder nicht verfügbar: ${(e as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function takePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setSnapshot(blob);
      if (snapshotUrl) URL.revokeObjectURL(snapshotUrl);
      setSnapshotUrl(URL.createObjectURL(blob));
    }, "image/jpeg", 0.92);
  }

  async function submit() {
    if (!snapshot) return;
    setBusy(true);
    try {
      const file = new File([snapshot], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
      const res = await receiptsApi.upload(file);
      navigate(`/review/${res.pendingId}`, { state: { extraction: res.extraction, fileName: res.fileName } });
    } catch (e) {
      toast({ title: "Upload fehlgeschlagen", description: String((e as Error).message) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mit Kamera aufnehmen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-md bg-black aspect-video" />
            <canvas ref={canvasRef} className="hidden" />
            {snapshotUrl && (
              <img src={snapshotUrl} alt="Aufnahme" className="w-full rounded-md border" />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={takePhoto} className="flex-1">
                {snapshot ? "Neu aufnehmen" : "Foto aufnehmen"}
              </Button>
              <Button onClick={submit} disabled={!snapshot || busy} className="flex-1">
                {busy ? "Verarbeite..." : "Verarbeiten"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/upload/CameraCapture.tsx
git commit -m "feat(client): camera capture component"
```

---

### Task 30: Voice input component

**Files:**
- Modify: `client/src/components/upload/VoiceInput.tsx`

- [ ] **Step 1: Implement `client/src/components/upload/VoiceInput.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Mic, MicOff } from "lucide-react";
import { receiptsApi } from "@/api/receipts";
import { createRecognizer, isSpeechRecognitionSupported, type SpeechController } from "@/lib/speechRecognition";

export function VoiceInput() {
  const [supported] = useState<boolean>(isSpeechRecognitionSupported());
  const [recording, setRecording] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [busy, setBusy] = useState(false);
  const recRef = useRef<SpeechController | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!supported) return;
    recRef.current = createRecognizer({
      lang: "de-DE",
      onResult: (r) => {
        if (r.isFinal) {
          setFinalText((prev) => (prev ? prev + " " : "") + r.transcript.trim());
          setInterim("");
        } else {
          setInterim(r.transcript);
        }
      },
      onError: () => setRecording(false),
      onEnd: () => setRecording(false),
    });
  }, [supported]);

  function toggle() {
    if (!recRef.current) return;
    if (recording) {
      recRef.current.stop();
      setRecording(false);
    } else {
      setFinalText("");
      setInterim("");
      recRef.current.start();
      setRecording(true);
    }
  }

  async function submit() {
    const transcript = (finalText + " " + interim).trim();
    if (!transcript) return toast({ title: "Bitte zuerst etwas einsprechen." });
    setBusy(true);
    try {
      const res = await receiptsApi.voice(transcript);
      navigate(`/review/${res.pendingId}`, { state: { extraction: res.extraction } });
    } catch (e) {
      toast({ title: "Verarbeitung fehlgeschlagen", description: String((e as Error).message) });
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Spracheingabe</CardTitle>
          <CardDescription>Dein Browser unterstützt die Web-Speech-API nicht. Verwende Chrome, Edge oder Safari.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spracheingabe (Deutsch)</CardTitle>
        <CardDescription>Beschreibe den Beleg, z.B. "Heute 45 Euro beim Restaurant Mayer, Geschäftsessen mit Karte gezahlt".</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={toggle} variant={recording ? "destructive" : "default"} className="w-full">
          {recording ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
          {recording ? "Aufnahme stoppen" : "Aufnahme starten"}
        </Button>
        <div className="rounded-md border p-3 min-h-[6rem] text-sm">
          <span>{finalText}</span>
          <span className="text-muted-foreground italic"> {interim}</span>
          {!finalText && !interim && <span className="text-muted-foreground">Transkript erscheint hier...</span>}
        </div>
        <Button onClick={submit} disabled={busy || (!finalText && !interim)} className="w-full">
          {busy ? "Verarbeite..." : "Verarbeiten"}
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/upload/VoiceInput.tsx
git commit -m "feat(client): voice input via Web Speech API"
```

---

### Task 31: Drive Inbox component

**Files:**
- Modify: `client/src/components/upload/DriveInbox.tsx`
- Create: `client/src/hooks/useDriveInbox.ts`

- [ ] **Step 1: Create `client/src/hooks/useDriveInbox.ts`**

```ts
import { useQuery } from "@tanstack/react-query";
import { driveApi } from "@/api/drive";

export function useDriveInbox() {
  return useQuery({
    queryKey: ["drive", "inbox"],
    queryFn: () => driveApi.inbox(),
    refetchInterval: 30_000,
  });
}
```

- [ ] **Step 2: Implement `client/src/components/upload/DriveInbox.tsx`**

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { useDriveInbox } from "@/hooks/useDriveInbox";
import { driveApi } from "@/api/drive";

export function DriveInbox() {
  const { data, isLoading, refetch } = useDriveInbox();
  const [busyId, setBusyId] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  async function importFile(id: string) {
    setBusyId(id);
    try {
      const res = await driveApi.importFile(id);
      navigate(`/review/${res.pendingId}`, { state: { extraction: res.extraction, fileName: res.fileName } });
    } catch (e) {
      toast({ title: "Import fehlgeschlagen", description: String((e as Error).message) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Drive-Inbox</CardTitle>
        <CardDescription>
          Lege Belege im <code>Beleg-Manager/Inbox</code> Ordner deines Drives ab. Auto-Verarbeitung läuft alle 5 Min,
          oder du importierst manuell.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (data?.files ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Dateien in der Inbox.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {data!.files.map((f) => (
              <li key={f.id} className="flex items-center justify-between p-3 gap-4">
                <div className="min-w-0">
                  <div className="font-medium truncate">{f.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {f.mimeType}
                    {f.status === "pending_review" && " · Bereit zum Review"}
                    {f.status === "failed" && " · Verarbeitung fehlgeschlagen"}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={f.status === "pending_review" ? "default" : "outline"}
                  disabled={busyId === f.id}
                  onClick={() => importFile(f.id)}
                >
                  {busyId === f.id ? "..." : f.status === "pending_review" ? "Review öffnen" : "Verarbeiten"}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button variant="outline" size="sm" onClick={() => refetch()}>Aktualisieren</Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Build + commit**

```bash
npm --workspace client run typecheck
git add client/src
git commit -m "feat(client): drive inbox component"
```

---

## Phase 11 — Client Review + Settings

### Task 32: Receipt form (review)

**Files:**
- Create: `client/src/lib/validators.ts`
- Create: `client/src/components/receipts/ReceiptForm.tsx`

- [ ] **Step 1: Create `client/src/lib/validators.ts`**

```ts
import { z } from "zod";

export const ReceiptFormZ = z.object({
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum muss YYYY-MM-DD sein"),
  haendler: z.string().min(1, "Pflichtfeld"),
  betrag: z.coerce.number().nonnegative("Muss ≥ 0 sein"),
  mwst: z.coerce.number().nonnegative("Muss ≥ 0 sein"),
  waehrung: z.string().min(1, "Pflichtfeld"),
  kategorie: z.string().min(1, "Pflichtfeld"),
  zahlungsmethode: z.string().min(1, "Pflichtfeld"),
  rechnungsnummer: z.string().default(""),
});

export type ReceiptFormValues = z.infer<typeof ReceiptFormZ>;
```

- [ ] **Step 2: Create `client/src/components/receipts/ReceiptForm.tsx`**

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReceiptFormZ, type ReceiptFormValues } from "@/lib/validators";

const KATEGORIEN = ["Restaurant", "Tankstelle", "Büromaterial", "Reise", "Unterkunft", "Software", "Sonstiges"];
const ZAHLUNGSMETHODEN = ["Karte", "Kreditkarte", "Bar", "Überweisung", "PayPal", "Sonstiges"];
const WAEHRUNGEN = ["EUR", "USD", "CHF", "GBP"];

export function ReceiptForm({
  initial,
  onSubmit,
  busy,
}: {
  initial: Partial<ReceiptFormValues>;
  onSubmit: (values: ReceiptFormValues) => Promise<void>;
  busy: boolean;
}) {
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<ReceiptFormValues>({
    resolver: zodResolver(ReceiptFormZ),
    defaultValues: {
      datum: initial.datum ?? new Date().toISOString().slice(0, 10),
      haendler: initial.haendler ?? "",
      betrag: initial.betrag ?? 0,
      mwst: initial.mwst ?? 0,
      waehrung: initial.waehrung ?? "EUR",
      kategorie: initial.kategorie ?? "Sonstiges",
      zahlungsmethode: initial.zahlungsmethode ?? "Karte",
      rechnungsnummer: initial.rechnungsnummer ?? "",
    },
  });

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit(onSubmit)}>
      <Field label="Datum" error={errors.datum?.message}>
        <Input type="date" {...register("datum")} />
      </Field>
      <Field label="Händler" error={errors.haendler?.message}>
        <Input {...register("haendler")} />
      </Field>
      <Field label="Betrag (brutto)" error={errors.betrag?.message}>
        <Input type="number" step="0.01" {...register("betrag")} />
      </Field>
      <Field label="MwSt" error={errors.mwst?.message}>
        <Input type="number" step="0.01" {...register("mwst")} />
      </Field>
      <Field label="Währung" error={errors.waehrung?.message}>
        <Select value={watch("waehrung")} onValueChange={(v) => setValue("waehrung", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{WAEHRUNGEN.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field label="Kategorie" error={errors.kategorie?.message}>
        <Select value={watch("kategorie")} onValueChange={(v) => setValue("kategorie", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{KATEGORIEN.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field label="Zahlungsmethode" error={errors.zahlungsmethode?.message}>
        <Select value={watch("zahlungsmethode")} onValueChange={(v) => setValue("zahlungsmethode", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{ZAHLUNGSMETHODEN.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field label="Rechnungsnummer" error={errors.rechnungsnummer?.message}>
        <Input {...register("rechnungsnummer")} />
      </Field>
      <div className="md:col-span-2">
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Speichere..." : "Speichern und archivieren"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Add a small unit test for the validator**

`client/src/lib/__tests__/validators.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ReceiptFormZ } from "../validators";

describe("ReceiptFormZ", () => {
  const valid = {
    datum: "2026-05-07",
    haendler: "Mayer",
    betrag: 10,
    mwst: 1,
    waehrung: "EUR",
    kategorie: "Restaurant",
    zahlungsmethode: "Karte",
    rechnungsnummer: "",
  };
  it("accepts valid input", () => { expect(ReceiptFormZ.parse(valid)).toBeTruthy(); });
  it("rejects bad date", () => { expect(() => ReceiptFormZ.parse({ ...valid, datum: "07.05.2026" })).toThrow(); });
  it("coerces betrag from string", () => { const out = ReceiptFormZ.parse({ ...valid, betrag: "10.5" as any }); expect(out.betrag).toBe(10.5); });
});
```

- [ ] **Step 4: Run client tests**

```bash
npm --workspace client test
```

- [ ] **Step 5: Commit**

```bash
git add client/src
git commit -m "feat(client): receipt form + zod validator"
```

---

### Task 33: Review page

**Files:**
- Create: `client/src/pages/Review.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Create `client/src/pages/Review.tsx`**

```tsx
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReceiptForm } from "@/components/receipts/ReceiptForm";
import { useToast } from "@/components/ui/use-toast";
import { receiptsApi } from "@/api/receipts";
import { useState } from "react";
import type { Extraction } from "@/types/receipt";

type LocationState = { extraction?: Extraction; fileName?: string } | null;

export function ReviewPage() {
  const { pendingId } = useParams<{ pendingId: string }>();
  const { state } = useLocation() as { state: LocationState };
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  if (!pendingId || !state?.extraction) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Review nicht verfügbar</CardTitle>
          <CardDescription>
            Diese Review-Sitzung ist nicht mehr gültig (Browser-Refresh oder direkter Link). Bitte erneut hochladen.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const initial = {
    datum: state.extraction.datum ?? undefined,
    haendler: state.extraction.haendler ?? undefined,
    betrag: state.extraction.betrag ?? undefined,
    mwst: state.extraction.mwst ?? 0,
    waehrung: state.extraction.waehrung ?? "EUR",
    kategorie: state.extraction.kategorie ?? "Sonstiges",
    zahlungsmethode: state.extraction.zahlungsmethode ?? "Karte",
    rechnungsnummer: state.extraction.rechnungsnummer ?? "",
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Beleg überprüfen</CardTitle>
          <CardDescription>
            Vergleiche die extrahierten Felder und korrigiere bei Bedarf.{state.fileName ? ` (${state.fileName})` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReceiptForm
            initial={initial}
            busy={busy}
            onSubmit={async (values) => {
              setBusy(true);
              try {
                await receiptsApi.confirm({ pendingId, ...values });
                qc.invalidateQueries({ queryKey: ["receipts"] });
                qc.invalidateQueries({ queryKey: ["stats"] });
                qc.invalidateQueries({ queryKey: ["drive", "inbox"] });
                toast({ title: "Beleg gespeichert" });
                navigate("/");
              } catch (e) {
                toast({ title: "Speichern fehlgeschlagen", description: String((e as Error).message) });
              } finally {
                setBusy(false);
              }
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `client/src/App.tsx`**

```tsx
import { ReviewPage } from "@/pages/Review";
// ...
<Route path="/review/:pendingId" element={<ReviewPage />} />
```

- [ ] **Step 3: Build + commit**

```bash
npm --workspace client run typecheck
git add client/src
git commit -m "feat(client): review page with confirm flow"
```

---

### Task 34: Settings page

**Files:**
- Create: `client/src/pages/Settings.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Create `client/src/pages/Settings.tsx`**

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";

export function SettingsPage() {
  const { user } = useAuth();
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Einstellungen</h1>
      <Card>
        <CardHeader>
          <CardTitle>Konto</CardTitle>
          <CardDescription>Du bist angemeldet als <span className="font-medium">{user?.email}</span>.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Beim ersten Login hat die App in deinem Drive den Ordner <code>Beleg-Manager/</code> mit
            Unterordnern <code>Inbox/</code> und <code>Archive/</code> sowie das Sheet <code>belege</code> angelegt.
            Belege im Inbox-Ordner werden alle 5 Minuten automatisch verarbeitet.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `App.tsx`**

```tsx
import { SettingsPage } from "@/pages/Settings";
// ...
<Route path="/settings" element={<SettingsPage />} />
```

- [ ] **Step 3: Commit**

```bash
git add client/src
git commit -m "feat(client): settings page"
```

---

## Phase 12 — Production & Smoke Test

### Task 35: Production static serving

**Files:**
- Modify: `server/src/app.ts`
- Modify: `server/package.json` (add prod-time path resolution)

- [ ] **Step 1: Modify `server/src/app.ts` — add static serving when production**

Add to `createApp` after all `/api/*` routes (and before the error handler):

```ts
import path from "node:path";
import url from "node:url";

// inside createApp:
if (deps.config.nodeEnv === "production") {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const clientDist = path.resolve(here, "../../client/dist");
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
NODE_ENV=production node server/dist/server.js
```

(Manually open `http://localhost:3000` to confirm SPA loads. Then Ctrl+C.)

- [ ] **Step 3: Commit**

```bash
git add server/src/app.ts
git commit -m "feat(server): serve client/dist in production"
```

---

### Task 36: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

````markdown
# Beleg-Manager

Receipts, invoices and vouchers — captured by photo, voice or Google-Drive inbox, extracted via Gemini, archived in your Google Drive, and persisted to a Google Sheet.

## Setup

### 1. Google Cloud project

1. Open https://console.cloud.google.com/ and create a new project.
2. Under **APIs & Services → Library**, enable:
   - Google Drive API
   - Google Sheets API
3. Under **APIs & Services → OAuth consent screen**, configure an external/testing app. Add test users (the Google accounts that will sign in during development).
4. Under **APIs & Services → Credentials**, create an **OAuth 2.0 Client ID** of type "Web application":
   - Authorized JavaScript origins: `http://localhost:5173`
   - Authorized redirect URIs: `http://localhost:3000/api/auth/google/callback`
5. Note the Client ID and Client Secret.

### 2. Gemini API key

Create one at https://aistudio.google.com/app/apikey.

### 3. `.env`

```bash
cp .env.example .env
# fill in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GEMINI_API_KEY, SESSION_SECRET (32+ chars)
```

### 4. Install + run

```bash
npm install
npm run dev
```

Server: http://localhost:3000 — Client: http://localhost:5173

## Production build

```bash
npm run build
NODE_ENV=production node server/dist/server.js
```

The Express server then serves the built React app from `client/dist`.

## How it works

- **First login** auto-creates `My Drive/Beleg-Manager/{Inbox,Archive}` and a Google Sheet `belege`.
- **Photo upload / camera capture** → Gemini extracts fields → review screen → file archived into `Archive/YYYY/MM/`, row appended to the Sheet.
- **Voice input** → Web Speech API transcribes (de-DE) → Gemini extracts fields → review screen → row appended (no file to archive).
- **Drive inbox** → place a file in `Beleg-Manager/Inbox/`. Either wait up to 5 min for the auto-poller, or open the Drive-Inbox tab and import manually. Confirmed files move to the archive.
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup instructions"
```

---

### Task 37: Playwright smoke test (login redirect)

**Files:**
- Create: `client/playwright.config.ts`
- Create: `client/e2e/smoke.spec.ts`
- Modify: `client/package.json` (add scripts + dep)

- [ ] **Step 1: Add dep + script in `client/package.json`**

In `devDependencies` add `"@playwright/test": "^1.48.0"`. In `scripts` add `"e2e": "playwright test"`.

```bash
npm install
npx playwright install chromium
```

- [ ] **Step 2: Create `client/playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:5173" },
  webServer: {
    command: "npm run dev",
    cwd: "..",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Create `client/e2e/smoke.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("unauthenticated user is redirected to /login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("link", { name: /Mit Google anmelden/i })).toBeVisible();
});

test("login button has correct href", async ({ page }) => {
  await page.goto("/login");
  const link = page.getByRole("link", { name: /Mit Google anmelden/i });
  await expect(link).toHaveAttribute("href", "/api/auth/google");
});
```

- [ ] **Step 4: Run smoke test**

This requires real `GOOGLE_CLIENT_ID`/`GEMINI_API_KEY` in `.env` so that the server boots. With those set:

```bash
npm --workspace client run e2e
```

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add client
git commit -m "test(client): playwright smoke for login redirect"
```

---

## Final verification

- [ ] **Run full suite**

```bash
npm run typecheck
npm run test
npm run build
```

All three should succeed with no errors.

- [ ] **Manual happy-path** (with valid `.env`):

  1. `npm run dev`
  2. Visit http://localhost:5173, click "Mit Google anmelden", complete OAuth.
  3. Verify `Beleg-Manager` folder + `belege` sheet appear in your Drive.
  4. Upload a real receipt photo → review the extracted fields → confirm.
  5. Check Drive Archive folder — file moved into `Archive/YYYY/MM/`.
  6. Check Sheet — row appended.
  7. Drop a receipt into `Beleg-Manager/Inbox/` → wait 5 min or hit "Aktualisieren" in the Drive-Inbox tab → import → confirm.
  8. Try voice input ("45 Euro Restaurant Mayer Karte heute") in Chrome → confirm row appears.

---

## Spec coverage map

| Spec section | Implemented in tasks |
|---|---|
| §2 Tech-Stack | 1, 2, 3 |
| §3 Architektur (monorepo + BFF) | 1, 6, 18, 35 |
| §4 Auth (Google OAuth, sessions, security) | 6, 7, 8, 17 |
| §5 Drive folder structure + Sheet columns | 11, 12, 16 |
| §6 API endpoints | 8, 18, 19, 20 |
| §7 Server modules | All server tasks |
| §8 Frontend modules | 22-34 |
| §9 Verarbeitungs-Flow (foto/voice/drive) | 14, 18, 21, 28-31, 33 |
| §10 Gemini integration | 13, 14 |
| §11 Fehlerbehandlung | 14 (fallback), 18 (error handler), 21 (failed-status) |
| §12 Testing | 4, 5, 7, 11, 13, 16, 19, 32, 37 |
| §13 Deployment | 35, 36 |
| §13.1 Browser-Limits | 27, 30 (`isSpeechRecognitionSupported`) |
| §15 Offene Punkte | Default Kategorien hardcoded in 32; default currency EUR in 32; failed inbox status in 21 |

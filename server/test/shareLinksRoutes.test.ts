import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { openDatabase } from "../src/db/index.js";
import { runMigrations } from "../src/db/migrations.js";
import { createShareLinkRepo } from "../src/share-links/repo.js";
import { createSplitRequestRepo } from "../src/split-requests/repo.js";
import { buildShareLinksRouter } from "../src/share-links/routes.js";
import express from "express";
import { TEST_CONFIG } from "./helpers/buildTestApp.js";

function makeApp() {
  const db = openDatabase(":memory:");
  runMigrations(db);
  const shareLinkRepo = createShareLinkRepo(db);
  const splitRequestRepo = createSplitRequestRepo(db);

  // insert a test user
  db.prepare(
    `INSERT INTO users (id, email, name, refresh_token, created_at)
     VALUES ('u1', 'owner@test.de', 'Owner', 'rt1', ${Date.now()})`
  ).run();

  const app = express();
  app.use(express.json());

  // stub session
  app.use((req, _res, next) => {
    (req as unknown as Record<string, unknown>).session = { userId: "u1" };
    next();
  });

  const router = buildShareLinksRouter({
    config: TEST_CONFIG,
    db,
    shareLinkRepo,
    splitRequestRepo,
    shareReceiptsWithEmail: vi.fn().mockResolvedValue(undefined),
    sendShareLinkEmail: vi.fn().mockResolvedValue(undefined),
    clientOrigin: "http://localhost:5173",
  });
  app.use("/api/share-links", router);
  return { app, db, shareLinkRepo };
}

describe("share-links routes", () => {
  it("POST /api/share-links creates a link and returns shareUrl", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/api/share-links")
      .send({ personName: "Alice", personEmail: "alice@example.com" });
    expect(res.status).toBe(201);
    expect(res.body.shareUrl).toMatch(/\/share\//);
    expect(res.body.expiresAt).toBeGreaterThan(Date.now());
  });

  it("GET /api/share-links/:token returns split requests for valid token", async () => {
    const { app, db, shareLinkRepo } = makeApp();
    const link = shareLinkRepo.create({
      fromUserId: "u1",
      personName: "Bob",
      personEmail: "bob@example.com",
    });

    // insert a split request for this person
    db.prepare(
      `INSERT INTO split_requests
        (id, from_user_id, to_user_id, free_name, receipt_id, receipt_sqlite_id,
         receipt_meta, betrag, nachricht, status, created_at, updated_at)
       VALUES ('sr1', 'u1', NULL, 'Bob', NULL, NULL,
               '{"haendler":"Aldi","datum":"2024-01-10","gesamtbetrag":20,"waehrung":"EUR"}',
               10, 'Test', 'pending', ${Date.now()}, ${Date.now()})`
    ).run();

    const res = await request(app).get(`/api/share-links/${link.token}`);
    expect(res.status).toBe(200);
    expect(res.body.personName).toBe("Bob");
    expect(res.body.requests).toHaveLength(1);
    expect(res.body.requests[0]).not.toHaveProperty("fromUserId");
    expect(res.body.requests[0]).toHaveProperty("id");
    expect(res.body.requests[0].haendler).toBe("Aldi");
  });

  it("GET /api/share-links/:token excludes settled and cancelled split requests", async () => {
    const { app, db, shareLinkRepo } = makeApp();
    const link = shareLinkRepo.create({
      fromUserId: "u1",
      personName: "Bob",
      personEmail: "bob@example.com",
    });

    // insert a settled split request
    db.prepare(
      `INSERT INTO split_requests
        (id, from_user_id, to_user_id, free_name, receipt_id, receipt_sqlite_id,
         receipt_meta, betrag, nachricht, status, created_at, updated_at)
       VALUES ('sr_settled', 'u1', NULL, 'Bob', NULL, NULL,
               '{"haendler":"Lidl","datum":"2024-01-11","gesamtbetrag":30,"waehrung":"EUR"}',
               15, 'Settled Msg', 'settled', ${Date.now()}, ${Date.now()})`
    ).run();

    // insert a cancelled split request
    db.prepare(
      `INSERT INTO split_requests
        (id, from_user_id, to_user_id, free_name, receipt_id, receipt_sqlite_id,
         receipt_meta, betrag, nachricht, status, created_at, updated_at)
       VALUES ('sr_cancelled', 'u1', NULL, 'Bob', NULL, NULL,
               '{"haendler":"Rewe","datum":"2024-01-12","gesamtbetrag":40,"waehrung":"EUR"}',
               20, 'Cancelled Msg', 'cancelled', ${Date.now()}, ${Date.now()})`
    ).run();

    const res = await request(app).get(`/api/share-links/${link.token}`);
    expect(res.status).toBe(200);
    expect(res.body.requests).toHaveLength(0);
  });

  it("GET /api/share-links/:token returns 410 for expired token", async () => {
    const { app, db } = makeApp();
    const { v4: uuidv4 } = await import("uuid");
    const crypto = await import("node:crypto");
    db.prepare(
      `INSERT INTO share_links (id, token, from_user_id, person_name, person_email, created_at, expires_at)
       VALUES (?, ?, 'u1', 'Old', 'old@x.de', ?, ?)`
    ).run(uuidv4(), crypto.randomBytes(32).toString("base64url"), Date.now() - 1000, Date.now() - 1);

    const rows = db.prepare("SELECT token FROM share_links WHERE person_email = 'old@x.de'").all() as Array<{ token: string }>;
    const res = await request(app).get(`/api/share-links/${rows[0]!.token}`);
    expect(res.status).toBe(410);
  });

  it("GET /api/share-links/:token returns 404 for unknown token", async () => {
    const { app } = makeApp();
    const crypto = await import("node:crypto");
    const fakeToken = crypto.randomBytes(32).toString("base64url");
    const res = await request(app).get(`/api/share-links/${fakeToken}`);
    expect(res.status).toBe(404);
  });

  it("DELETE /api/share-links/:id removes own link", async () => {
    const { app, shareLinkRepo } = makeApp();
    const link = shareLinkRepo.create({ fromUserId: "u1", personName: "X", personEmail: "x@x.de" });
    const res = await request(app).delete(`/api/share-links/${link.id}`);
    expect(res.status).toBe(200);
    expect(shareLinkRepo.getByToken(link.token)).toBeUndefined();
  });
});

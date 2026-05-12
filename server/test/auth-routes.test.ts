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

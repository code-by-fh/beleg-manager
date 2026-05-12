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

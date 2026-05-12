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

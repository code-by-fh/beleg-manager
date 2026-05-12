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

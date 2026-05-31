import { z } from "zod";

export const CreateSplitRequestBody = z.object({
  toUserId: z.string().min(1).optional(),
  freeName: z.string().min(1).max(200).optional(),
  receiptId: z.string().min(1).optional(),
  receiptSqliteId: z.string().min(1).optional(),
  receiptMeta: z.object({
    haendler: z.string().min(1),
    datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    gesamtbetrag: z.number().positive(),
    waehrung: z.string().min(1).default("EUR"),
  }),
  betrag: z.number().positive(),
  nachricht: z.string().max(500).default(""),
  positions: z.array(z.object({
    name: z.string(),
    amount: z.number(),
    assigned: z.array(z.string()),
    quantity: z.number().int().positive().optional(),
  })).optional().nullable(),
}).refine(
  (d) => d.toUserId || d.freeName,
  { message: "Either toUserId or freeName is required" }
);

export const UpdateStatusBody = z.object({
  status: z.enum(["pending", "accepted", "rejected", "cancelled", "settled"]),
  grund: z.string().max(500).optional(),
});

export const LinkBankTxBody = z.object({
  bankTxId: z.string().min(1).nullable(),
});

export const SearchQuerySchema = z.object({
  q: z.string().min(2).max(100),
});

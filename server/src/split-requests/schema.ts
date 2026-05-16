import { z } from "zod";

export const CreateSplitRequestBody = z.object({
  toUserId: z.string().min(1),
  receiptId: z.string().min(1),
  receiptMeta: z.object({
    haendler: z.string().min(1),
    datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    gesamtbetrag: z.number().positive(),
    waehrung: z.string().min(1).default("EUR"),
  }),
  betrag: z.number().positive(),
  nachricht: z.string().max(500).default(""),
});

export const UpdateStatusBody = z.object({
  status: z.enum(["accepted", "rejected", "cancelled"]),
  grund: z.string().max(500).optional(),
});

export const SearchQuerySchema = z.object({
  q: z.string().min(2).max(100),
});

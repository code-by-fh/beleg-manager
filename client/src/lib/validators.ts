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

import { z } from "zod";

export const ExtractionZ = z.object({
  datum: z.string().nullable(),
  haendler: z.string().nullable(),
  betrag: z.number().nullable(),
  mwst: z.number().nullable(),
  trinkgeld: z.number().nullable(),
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
    trinkgeld: { type: "number", nullable: true },
    waehrung: { type: "string", nullable: true, description: "ISO 4217 code, e.g. EUR" },
    kategorie: { type: "string", nullable: true },
    zahlungsmethode: { type: "string", nullable: true },
    rechnungsnummer: { type: "string", nullable: true },
  },
  required: ["datum", "haendler", "betrag", "mwst", "trinkgeld", "waehrung", "kategorie", "zahlungsmethode", "rechnungsnummer"],
} as const;

export function emptyExtraction(): Extraction {
  return {
    datum: null,
    haendler: null,
    betrag: null,
    mwst: null,
    trinkgeld: null,
    waehrung: null,
    kategorie: null,
    zahlungsmethode: null,
    rechnungsnummer: null,
  };
}

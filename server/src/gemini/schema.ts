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
  positions: z.array(
    z.object({
      name: z.string(),
      amount: z.number(),
    })
  ).nullable().optional(),
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
    positions: {
      type: "array",
      nullable: true,
      description: "List of individual line items/positions on the receipt.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name or description of the line item" },
          amount: { type: "number", description: "Price or amount of the line item" },
        },
        required: ["name", "amount"],
      },
    },
  },
  required: ["datum", "haendler", "betrag", "mwst", "trinkgeld", "waehrung", "kategorie", "zahlungsmethode", "rechnungsnummer", "positions"],
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
    positions: null,
  };
}

export const ReceiptPositionsZ = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      amount: z.number(),
    })
  ),
  total: z.number(),
});

export type ReceiptPositions = z.infer<typeof ReceiptPositionsZ>;

export const GEMINI_POSITIONS_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name/description of the line item" },
          amount: { type: "number", description: "Price/amount of the line item" },
        },
        required: ["name", "amount"],
      },
    },
    total: { type: "number", description: "Total receipt amount" },
  },
  required: ["items", "total"],
} as const;


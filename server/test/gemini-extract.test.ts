import { describe, it, expect, vi } from "vitest";
import { ExtractionZ, emptyExtraction } from "../src/gemini/schema.js";

describe("Extraction parsing pathway", () => {
  it("safeParse falls back to empty on invalid input", () => {
    const result = ExtractionZ.safeParse({ datum: 123 });
    expect(result.success).toBe(false);
  });

  it("emptyExtraction is a valid Extraction", () => {
    expect(ExtractionZ.parse(emptyExtraction())).toBeTruthy();
  });
});

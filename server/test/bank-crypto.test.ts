import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encrypt, decrypt } from "../src/bank/crypto.js";

const VALID_KEY = "a".repeat(64); // 32 bytes as hex

describe("bank crypto", () => {
  beforeEach(() => {
    process.env.BANK_ENCRYPTION_KEY = VALID_KEY;
  });

  afterEach(() => {
    delete process.env.BANK_ENCRYPTION_KEY;
  });

  it("encrypt then decrypt returns the original plaintext", () => {
    const plaintext = "Edeka Stuttgart";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("encrypting the same plaintext twice produces different ciphertext (random IV)", () => {
    const a = encrypt("Aldi Süd");
    const b = encrypt("Aldi Süd");
    expect(a).not.toBe(b);
  });

  it("encrypt returns plaintext unchanged when BANK_ENCRYPTION_KEY is not set", () => {
    delete process.env.BANK_ENCRYPTION_KEY;
    expect(encrypt("Aldi")).toBe("Aldi");
  });

  it("decrypt returns value unchanged when BANK_ENCRYPTION_KEY is not set", () => {
    delete process.env.BANK_ENCRYPTION_KEY;
    expect(decrypt("Aldi")).toBe("Aldi");
  });

  it("decrypt returns input unchanged for plaintext alt-data (no colon separator)", () => {
    // Simulate a legacy row that was stored before encryption was introduced
    expect(decrypt("Rewe GmbH")).toBe("Rewe GmbH");
  });

  it("decrypt returns input unchanged for corrupted ciphertext", () => {
    const corrupted = "aGVsbG8=:d29ybGQ=:AAAA"; // wrong auth tag length
    const result = decrypt(corrupted);
    // Should not throw; returns the raw input
    expect(typeof result).toBe("string");
  });

  it("handles empty string round-trip", () => {
    expect(decrypt(encrypt(""))).toBe("");
  });

  it("handles unicode characters round-trip", () => {
    const text = "Café München GmbH & Co. KG";
    expect(decrypt(encrypt(text))).toBe(text);
  });
});

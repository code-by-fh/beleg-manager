import { describe, it, expect } from "vitest";
import { matchTransactions } from "../../src/bank/matcher.js";
import type { ReceiptForMatching } from "../../src/bank/matcher.js";
import type { ParsedTransaction } from "../../src/bank/csvParser.js";

// ---------------------------------------------------------------------------
// Helpers to build fixture objects concisely
// ---------------------------------------------------------------------------

function tx(
  overrides: Partial<ParsedTransaction> & { betrag: number }
): ParsedTransaction {
  return {
    buchungsdatum: "2024-03-15",
    haendler: "REWE",
    verwendungszweck: "",
    ...overrides,
  };
}

function receipt(overrides: Partial<ReceiptForMatching> & { betrag: number }): ReceiptForMatching {
  return {
    id: "r1",
    datum: "2024-03-15",
    haendler: "REWE",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("matchTransactions", () => {
  it("exact match (amount + same date + same haendler) → high confidence", () => {
    const transactions = [tx({ betrag: -42.5 })];
    const receipts = [receipt({ betrag: 42.5 })];

    const results = matchTransactions(transactions, receipts);

    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.matchedReceiptId).toBe("r1");
    expect(r.confidence).toBe("high");
    // score = 50 (amount) + 30 (date diff 0) + 20 (exact merchant) = 100
    expect(r.score).toBe(100);
  });

  it("amount only match (different date, different merchant) → low confidence", () => {
    const transactions = [
      tx({ betrag: -99.99, buchungsdatum: "2024-01-01", haendler: "SomeShop" }),
    ];
    const receipts = [
      receipt({
        betrag: 99.99,
        datum: "2024-06-15",
        haendler: "AnotherShop",
        id: "r2",
      }),
    ];

    const results = matchTransactions(transactions, receipts);

    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.matchedReceiptId).toBe("r2");
    expect(r.confidence).toBe("low");
    // score = 50 (amount only)
    expect(r.score).toBe(50);
  });

  it("no match when amount differs and merchant/date also differ → null confidence and no receipt", () => {
    // Different amount (0 pts), far-away date (0 pts), different merchant (0 pts) → score 0
    const transactions = [
      tx({ betrag: -10.0, buchungsdatum: "2024-01-01", haendler: "AlphaStore" }),
    ];
    const receipts = [
      receipt({ betrag: 99.99, datum: "2024-06-15", haendler: "BetaMart", id: "r1" }),
    ];

    const results = matchTransactions(transactions, receipts);

    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.matchedReceiptId).toBeNull();
    expect(r.confidence).toBeNull();
    expect(r.score).toBe(0);
  });

  it("negative tx betrag vs positive receipt betrag still matches", () => {
    const transactions = [tx({ betrag: -55.0 })];
    const receipts = [receipt({ betrag: 55.0 })];

    const results = matchTransactions(transactions, receipts);

    expect(results[0]!.matchedReceiptId).toBe("r1");
    expect(results[0]!.score).toBeGreaterThanOrEqual(50);
  });

  it("greedy: two transactions competing for same receipt → only the best gets matched", () => {
    // tx0 is a perfect match; tx1 matches only on amount (worse)
    const transactions = [
      tx({ betrag: -42.5, buchungsdatum: "2024-03-15", haendler: "REWE" }),  // score 100
      tx({ betrag: -42.5, buchungsdatum: "2024-01-01", haendler: "Other" }), // score 50
    ];
    const receipts = [
      receipt({ id: "r1", betrag: 42.5, datum: "2024-03-15", haendler: "REWE" }),
    ];

    const results = matchTransactions(transactions, receipts);

    expect(results).toHaveLength(2);
    // tx0 should win the receipt
    expect(results[0]!.matchedReceiptId).toBe("r1");
    expect(results[0]!.confidence).toBe("high");
    // tx1 gets nothing
    expect(results[1]!.matchedReceiptId).toBeNull();
    expect(results[1]!.confidence).toBeNull();
  });

  it("greedy: each transaction gets its own best receipt when available", () => {
    const transactions = [
      tx({ betrag: -10.0, haendler: "ShopA", buchungsdatum: "2024-03-01" }),
      tx({ betrag: -20.0, haendler: "ShopB", buchungsdatum: "2024-03-02" }),
    ];
    const receipts = [
      receipt({ id: "rA", betrag: 10.0, haendler: "ShopA", datum: "2024-03-01" }),
      receipt({ id: "rB", betrag: 20.0, haendler: "ShopB", datum: "2024-03-02" }),
    ];

    const results = matchTransactions(transactions, receipts);

    expect(results[0]!.matchedReceiptId).toBe("rA");
    expect(results[1]!.matchedReceiptId).toBe("rB");
  });

  it("date diff = 1 day adds +30", () => {
    const transactions = [
      tx({ betrag: -42.5, buchungsdatum: "2024-03-16", haendler: "X" }),
    ];
    const receipts = [
      receipt({ betrag: 42.5, datum: "2024-03-15", haendler: "X" }),
    ];

    const results = matchTransactions(transactions, receipts);
    // score = 50 (amount) + 30 (date diff 1) + 20 (exact merchant) = 100
    expect(results[0]!.score).toBe(100);
  });

  it("date diff = 2 days adds +15 (not +30)", () => {
    const transactions = [
      tx({ betrag: -42.5, buchungsdatum: "2024-03-17", haendler: "X" }),
    ];
    const receipts = [
      receipt({ betrag: 42.5, datum: "2024-03-15", haendler: "X" }),
    ];

    const results = matchTransactions(transactions, receipts);
    // score = 50 (amount) + 15 (date diff 2) + 20 (exact merchant) = 85
    expect(results[0]!.score).toBe(85);
    expect(results[0]!.confidence).toBe("high");
  });

  it("merchant prefix match adds +10", () => {
    const transactions = [
      tx({ betrag: -42.5, buchungsdatum: "2024-03-15", haendler: "REWE Markt" }),
    ];
    const receipts = [
      receipt({ betrag: 42.5, datum: "2024-03-15", haendler: "REWE" }),
    ];

    const results = matchTransactions(transactions, receipts);
    // score = 50 (amount) + 30 (date diff 0) + 10 (prefix match) = 90
    expect(results[0]!.score).toBe(90);
  });

  it("legal suffix stripping: 'REWE GmbH' matches 'REWE' as exact merchant", () => {
    const transactions = [
      tx({ betrag: -42.5, buchungsdatum: "2024-03-15", haendler: "REWE GmbH" }),
    ];
    const receipts = [
      receipt({ betrag: 42.5, datum: "2024-03-15", haendler: "REWE" }),
    ];

    const results = matchTransactions(transactions, receipts);
    // After normalizing "REWE GmbH" → "rewe" and "REWE" → "rewe" → exact match +20
    // score = 50 + 30 + 20 = 100
    expect(results[0]!.score).toBe(100);
  });

  it("returns one result per transaction even with empty receipts list", () => {
    const transactions = [tx({ betrag: -10 }), tx({ betrag: -20 })];
    const results = matchTransactions(transactions, []);

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.matchedReceiptId).toBeNull();
      expect(r.confidence).toBeNull();
      expect(r.score).toBe(0);
    }
  });

  it("empty transactions array returns empty results", () => {
    const receipts = [receipt({ betrag: 42.5 })];
    const results = matchTransactions([], receipts);
    expect(results).toHaveLength(0);
    expect(results).toEqual([]);
  });

  it("transactionIndex in result corresponds to the original position in the input array", () => {
    const transactions = [
      tx({ betrag: -10.0, haendler: "ShopA", buchungsdatum: "2024-03-01" }),
      tx({ betrag: -20.0, haendler: "ShopB", buchungsdatum: "2024-03-02" }),
    ];
    const receipts = [
      receipt({ id: "rA", betrag: 10.0, haendler: "ShopA", datum: "2024-03-01" }),
      receipt({ id: "rB", betrag: 20.0, haendler: "ShopB", datum: "2024-03-02" }),
    ];

    const results = matchTransactions(transactions, receipts);

    expect(results).toHaveLength(2);
    expect(results[0]!.transactionIndex).toBe(0);
    expect(results[1]!.transactionIndex).toBe(1);
  });

  it("merchant name that normalizes to empty string ('GmbH') must not grant +20/+10 against an unrelated receipt", () => {
    // "GmbH" normalizes to "" — the empty-string guard must prevent any merchant bonus.
    const transactions = [
      tx({ betrag: -42.5, buchungsdatum: "2024-03-15", haendler: "GmbH" }),
    ];
    const receipts = [
      receipt({ betrag: 42.5, datum: "2024-03-15", haendler: "CompletelyUnrelated" }),
    ];

    const results = matchTransactions(transactions, receipts);
    // Score must be exactly 50 (amount) + 30 (date diff 0) = 80, NOT 80+20=100.
    // The empty normTx must not match against non-empty normReceipt.
    expect(results[0]!.score).toBe(80);
    // Merchant bonus must be absent: no +20 or +10
    const merchantBonus = results[0]!.score - 80;
    expect(merchantBonus).toBe(0);
  });

  it("medium confidence at score 65", () => {
    // amount (50) + date diff 1 (30) = 80 → high; adjust to get 65
    // amount (50) + date diff 2 (15) = 65 → medium
    const transactions = [
      tx({ betrag: -42.5, buchungsdatum: "2024-03-17", haendler: "Completely Different" }),
    ];
    const receipts = [
      receipt({ betrag: 42.5, datum: "2024-03-15", haendler: "OtherShop" }),
    ];

    const results = matchTransactions(transactions, receipts);
    expect(results[0]!.score).toBe(65);
    expect(results[0]!.confidence).toBe("medium");
  });
});

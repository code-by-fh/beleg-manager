/**
 * Transaction-to-receipt matching module.
 *
 * Uses a score-based greedy algorithm to match bank transactions
 * against existing receipts. Pure module — no DB, no HTTP.
 */

import type { ParsedTransaction } from "./csvParser.js";

// Minimal receipt shape required for matching (subset of the full ReceiptRow)
export type ReceiptForMatching = {
  id: string;
  datum: string;    // ISO YYYY-MM-DD
  haendler: string; // merchant name
  betrag: number;   // amount in EUR (positive)
};

export type MatchResult = {
  transactionIndex: number;
  matchedReceiptId: string | null;
  confidence: "high" | "medium" | "low" | null;
  score: number;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function matchTransactions(
  transactions: ParsedTransaction[],
  receipts: ReceiptForMatching[]
): MatchResult[] {
  // Build all (txIndex, receiptIndex, score) triples where score >= 50
  type Triple = { txIndex: number; receiptIndex: number; score: number };
  const triples: Triple[] = [];

  for (let txIndex = 0; txIndex < transactions.length; txIndex++) {
    const tx = transactions[txIndex];
    if (!tx) continue;

    for (let receiptIndex = 0; receiptIndex < receipts.length; receiptIndex++) {
      const receipt = receipts[receiptIndex];
      if (!receipt) continue;

      const score = computeScore(tx, receipt);
      if (score >= 50) {
        triples.push({ txIndex, receiptIndex, score });
      }
    }
  }

  // Sort descending by score
  triples.sort((a, b) => b.score - a.score);

  // Greedy assignment
  const usedTxIndices = new Set<number>();
  const usedReceiptIndices = new Set<number>();
  const assignments = new Map<number, { receiptIndex: number; score: number }>();

  for (const { txIndex, receiptIndex, score } of triples) {
    if (usedTxIndices.has(txIndex) || usedReceiptIndices.has(receiptIndex)) {
      continue;
    }
    assignments.set(txIndex, { receiptIndex, score });
    usedTxIndices.add(txIndex);
    usedReceiptIndices.add(receiptIndex);
  }

  // Build one MatchResult per transaction
  const results: MatchResult[] = [];
  for (let txIndex = 0; txIndex < transactions.length; txIndex++) {
    const assignment = assignments.get(txIndex);
    if (!assignment) {
      results.push({
        transactionIndex: txIndex,
        matchedReceiptId: null,
        confidence: null,
        score: 0,
      });
      continue;
    }

    const receipt = receipts[assignment.receiptIndex];
    results.push({
      transactionIndex: txIndex,
      matchedReceiptId: receipt?.id ?? null,
      confidence: scoreToConfidence(assignment.score),
      score: assignment.score,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function computeScore(tx: ParsedTransaction, receipt: ReceiptForMatching): number {
  let score = 0;

  // Amount comparison — use absolute values because tx betrag is negative for debits.
  // Round to cents to avoid floating-point equality failures (e.g. 0.1 + 0.2 ≠ 0.3).
  const roundCents = (n: number) => Math.round(Math.abs(n) * 100);
  if (roundCents(tx.betrag) === roundCents(receipt.betrag)) {
    score += 50;
  }

  // Date comparison — only the highest applicable bracket counts
  const dayDiff = Math.abs(dateToDays(tx.buchungsdatum) - dateToDays(receipt.datum));
  if (dayDiff <= 1) {
    score += 30;
  } else if (dayDiff <= 2) {
    score += 15;
  }

  // Merchant name comparison
  const normTx = normalizeHaendler(tx.haendler);
  const normReceipt = normalizeHaendler(receipt.haendler);

  // Guard against empty strings — an empty normalized name must not match anything.
  if (normTx.length > 0 && normReceipt.length > 0) {
    if (normTx === normReceipt) {
      score += 20;
    } else if (normTx.startsWith(normReceipt) || normReceipt.startsWith(normTx)) {
      score += 10;
    }
  }

  return score;
}

function scoreToConfidence(score: number): "high" | "medium" | "low" | null {
  if (score >= 80) return "high";
  if (score >= 65) return "medium";
  if (score >= 50) return "low";
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a merchant/Haendler name for fuzzy comparison:
 * lowercase, strip legal suffixes, remove punctuation, collapse whitespace.
 */
function normalizeHaendler(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\b(gmbh|ag|se|kg|kgaa|inc|ltd)\b/g, "")
    .replace(/[^a-z0-9äöüß\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Convert an ISO YYYY-MM-DD date string to a day count (fractional days are
 * floored). Uses UTC to avoid DST-related off-by-one errors.
 */
function dateToDays(isoDate: string): number {
  return Math.floor(new Date(isoDate).getTime() / 86_400_000);
}

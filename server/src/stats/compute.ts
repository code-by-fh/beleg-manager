import type { ReceiptRow } from "../google/sheets.js";

export type Summary = {
  monthTotal: number;
  yearTotal: number;
  count: number;
  topCategory: string | null;
};

export function computeSummary(rows: ReceiptRow[], today: Date = new Date()): Summary {
  const yyyy = today.getUTCFullYear();
  const mm = today.getUTCMonth() + 1;
  let monthTotal = 0, yearTotal = 0;
  const byCategory = new Map<string, number>();
  for (const r of rows) {
    const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(r.datum);
    if (!m) continue;
    const [_, y, mo] = m;
    if (Number(y) === yyyy) yearTotal += r.betrag;
    if (Number(y) === yyyy && Number(mo) === mm) monthTotal += r.betrag;
    byCategory.set(r.kategorie, (byCategory.get(r.kategorie) ?? 0) + r.betrag);
  }
  let topCategory: string | null = null;
  let topVal = 0;
  for (const [k, v] of byCategory) if (v > topVal) { topCategory = k; topVal = v; }
  return { monthTotal, yearTotal, count: rows.length, topCategory };
}

export function computeMonthly(rows: ReceiptRow[], months = 12, today: Date = new Date()): Array<{ ym: string; total: number }> {
  const buckets = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, 0);
  }
  for (const r of rows) {
    const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(r.datum);
    if (!m) continue;
    const key = `${m[1]}-${m[2]}`;
    if (buckets.has(key)) buckets.set(key, buckets.get(key)! + r.betrag);
  }
  return [...buckets.entries()].map(([ym, total]) => ({ ym, total }));
}

export function computeCategories(rows: ReceiptRow[]): Array<{ kategorie: string; total: number }> {
  const byCategory = new Map<string, number>();
  for (const r of rows) {
    byCategory.set(r.kategorie, (byCategory.get(r.kategorie) ?? 0) + r.betrag);
  }
  return [...byCategory.entries()]
    .map(([kategorie, total]) => ({ kategorie, total }))
    .sort((a, b) => b.total - a.total);
}

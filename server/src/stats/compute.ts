import type { ReceiptRow } from "../receipts/receiptRepo.js";

export type Summary = {
  monthTotal: number;
  prevMonthTotal: number;
  yearTotal: number;
  count: number;
  topCategory: string | null;
  avgPerReceipt: number;
  mwstYear: number;
  maxBetrag: number;
};

function parseDateParts(dateStr: string) {
  const mIso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (mIso) return { y: Number(mIso[1]), m: Number(mIso[2]) };
  const mDe = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(dateStr);
  if (mDe) return { y: Number(mDe[3]), m: Number(mDe[2]) };
  return null;
}

export function computeSummary(rows: ReceiptRow[], today: Date = new Date()): Summary {
  const yyyy = today.getUTCFullYear();
  const mm = today.getUTCMonth() + 1;
  const prevMm = mm === 1 ? 12 : mm - 1;
  const prevYyyy = mm === 1 ? yyyy - 1 : yyyy;

  let monthTotal = 0, prevMonthTotal = 0, yearTotal = 0, mwstYear = 0, maxBetrag = 0;
  const byCategory = new Map<string, number>();

  for (const r of rows) {
    const p = parseDateParts(r.datum);
    if (!p) continue;
    if (p.y === yyyy) { yearTotal += r.betrag; mwstYear += r.mwst; }
    if (p.y === yyyy && p.m === mm) monthTotal += r.betrag;
    if (p.y === prevYyyy && p.m === prevMm) prevMonthTotal += r.betrag;
    if (r.betrag > maxBetrag) maxBetrag = r.betrag;
    byCategory.set(r.kategorie, (byCategory.get(r.kategorie) ?? 0) + r.betrag);
  }

  let topCategory: string | null = null;
  let topVal = 0;
  for (const [k, v] of byCategory) if (v > topVal) { topCategory = k; topVal = v; }

  const avgPerReceipt = rows.length > 0 ? yearTotal / rows.length : 0;

  return { monthTotal, prevMonthTotal, yearTotal, count: rows.length, topCategory, avgPerReceipt, mwstYear, maxBetrag };
}

export function computeMonthly(rows: ReceiptRow[], months = 12, today: Date = new Date()): Array<{ ym: string; total: number }> {
  const buckets = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, 0);
  }
  for (const r of rows) {
    const p = parseDateParts(r.datum);
    if (!p) continue;
    const key = `${p.y}-${String(p.m).padStart(2, "0")}`;
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

export function computeTopMerchants(rows: ReceiptRow[], limit = 6): Array<{ haendler: string; total: number }> {
  const byMerchant = new Map<string, number>();
  for (const r of rows) {
    byMerchant.set(r.haendler, (byMerchant.get(r.haendler) ?? 0) + r.betrag);
  }
  return [...byMerchant.entries()]
    .map(([haendler, total]) => ({ haendler, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function computePaymentMethods(rows: ReceiptRow[]): Array<{ methode: string; total: number; count: number }> {
  const map = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    const raw = r.zahlungsmethode || "Unbekannt";
    const m = (raw === "Karte" || raw === "Kreditkarte") ? "(Kredit-)Karte" : raw;
    const cur = map.get(m) ?? { total: 0, count: 0 };
    map.set(m, { total: cur.total + r.betrag, count: cur.count + 1 });
  }
  return [...map.entries()]
    .map(([methode, v]) => ({ methode, ...v }))
    .sort((a, b) => b.total - a.total);
}

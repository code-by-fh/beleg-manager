const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const intl = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

export function formatCurrency(value: number, currency = "EUR"): string {
  if (currency === "EUR") return eur.format(value);
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function formatDateIso(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}

export function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  if (!y || !m) return ym;
  return new Intl.DateTimeFormat("de-DE", { month: "short", year: "2-digit" }).format(new Date(Number(y), Number(m) - 1, 1));
}

export const _intl = intl;

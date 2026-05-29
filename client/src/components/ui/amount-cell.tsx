import { formatCurrency } from "@/lib/formatters";

export function AmountCell({ amount }: { amount: number }) {
  if (amount < 0) {
    return <span className="text-red-500 font-medium">−{formatCurrency(Math.abs(amount))}</span>;
  }
  return <span className="text-green-600 font-medium">{formatCurrency(amount)}</span>;
}

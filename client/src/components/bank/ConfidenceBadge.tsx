import { BankTransaction } from "@/types/bank";

export function ConfidenceBadge({ confidence }: { confidence: BankTransaction["matchConfidence"] }) {
  if (!confidence) return null;
  const map: Record<NonNullable<BankTransaction["matchConfidence"]>, { label: string; cls: string }> = {
    high:   { label: "Hoch",    cls: "bg-green-100 text-green-700" },
    medium: { label: "Mittel",  cls: "bg-yellow-100 text-yellow-700" },
    low:    { label: "Niedrig", cls: "bg-orange-100 text-orange-700" },
    manual: { label: "Manuell", cls: "bg-blue-100 text-blue-700" },
  };
  const { label, cls } = map[confidence];
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      {label}
    </span>
  );
}

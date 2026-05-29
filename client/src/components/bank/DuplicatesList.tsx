import { useState } from "react";
import { DuplicateInfo } from "@/types/bank";
import { ChevronUp, ChevronDown } from "lucide-react";
import { formatDateIso } from "@/lib/formatters";
import { AmountCell } from "@/components/ui/amount-cell";

export function DuplicatesList({ duplicates }: { duplicates: DuplicateInfo[] }) {
  const [open, setOpen] = useState(false);
  if (duplicates.length === 0) return null;

  const visible = duplicates.slice(0, 10);
  const rest = duplicates.length - visible.length;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
      <button
        type="button"
        className="flex items-center gap-2 text-sm font-medium text-amber-800 w-full text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {duplicates.length} bereits vorhandene Transaktion{duplicates.length !== 1 ? "en" : ""} übersprungen
      </button>
      {open && (
        <ul className="space-y-1 pl-6">
          {visible.map((d, i) => (
            <li key={i} className="text-xs text-amber-700 flex gap-3">
              <span className="text-muted-foreground w-24 shrink-0">{formatDateIso(d.buchungsdatum)}</span>
              <span className="flex-1 truncate">{d.haendler}</span>
              <span className="shrink-0"><AmountCell amount={d.betrag} /></span>
            </li>
          ))}
          {rest > 0 && (
            <li className="text-xs text-muted-foreground pl-0">… und {rest} weitere</li>
          )}
        </ul>
      )}
    </div>
  );
}

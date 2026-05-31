import { formatCurrency } from "@/lib/formatters";
import { getAllParticipants, computeBetrag, type Position } from "./ShareRequestCard";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";

interface AdjustedPositionsViewProps {
  positions: Position[];
  waehrung: string;
  originalBetrag?: number | null;
  betrag?: number;
  originalPositions?: Position[] | null;
}

function positionsEqual(a: Position, b: Position): boolean {
  if (Math.abs(a.amount - b.amount) > 0.001) return false;
  const aNames = [...a.assigned].sort().join("|");
  const bNames = [...b.assigned].sort().join("|");
  return aNames === bNames;
}

export function AdjustedPositionsView({
  positions,
  waehrung,
  originalBetrag,
  betrag,
  originalPositions,
}: AdjustedPositionsViewProps) {
  const participants = getAllParticipants(positions);
  const hasBetragChange =
    originalBetrag != null && betrag != null && Math.abs(originalBetrag - betrag) > 0.001;
  const delta = hasBetragChange ? betrag! - originalBetrag! : 0;

  const origByName = new Map<string, Position>(
    (originalPositions ?? []).map((p) => [p.name, p])
  );

  return (
    <div className="mt-3 rounded-lg border border-orange-200/70 bg-orange-50/40 dark:border-orange-900/40 dark:bg-orange-900/10 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[10px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-400">
          Vom Empfänger angepasste Aufteilung
        </p>
        {hasBetragChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground line-through font-mono">
              {formatCurrency(originalBetrag!, waehrung)}
            </span>
            <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <span className="text-xs font-mono font-bold text-foreground">
              {formatCurrency(betrag!, waehrung)}
            </span>
            <span className={`flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${
              delta < 0
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            }`}>
              {delta < 0
                ? <TrendingDown className="h-3 w-3" />
                : <TrendingUp className="h-3 w-3" />}
              {delta > 0 ? "+" : ""}{formatCurrency(delta, waehrung)}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        {positions.map((pos, i) => {
          const orig = origByName.get(pos.name);
          const changed = orig != null && !positionsEqual(orig, pos);
          const isNew = orig == null && originalPositions != null;

          return (
            <div
              key={i}
              className={`flex flex-col gap-1 rounded-md border px-2.5 py-2 ${
                changed || isNew
                  ? "border-orange-300/70 bg-orange-50/60 dark:border-orange-700/50 dark:bg-orange-900/20"
                  : "border-border/50 bg-card"
              }`}
            >
              <div className="flex justify-between items-start gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-medium text-foreground truncate" title={pos.name}>
                    {pos.name}
                  </span>
                  {isNew && (
                    <span className="text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded bg-orange-200 text-orange-800 dark:bg-orange-800/40 dark:text-orange-300 flex-shrink-0">
                      Neu
                    </span>
                  )}
                  {changed && (
                    <span className="text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded bg-orange-200 text-orange-800 dark:bg-orange-800/40 dark:text-orange-300 flex-shrink-0">
                      Geändert
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {changed && orig && Math.abs(orig.amount - pos.amount) > 0.001 && (
                    <span className="text-[10px] font-mono text-muted-foreground line-through">
                      {formatCurrency(orig.amount, waehrung)}
                    </span>
                  )}
                  <span className="text-xs font-mono font-semibold text-primary">
                    {formatCurrency(pos.amount, waehrung)}
                  </span>
                </div>
              </div>
              {pos.assigned.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {pos.assigned.map((name, j) => (
                    <span
                      key={j}
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium tracking-wide bg-muted/80 text-muted-foreground"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {originalPositions?.filter((op) => !positions.some((p) => p.name === op.name)).map((op, i) => (
          <div
            key={`removed-${i}`}
            className="flex flex-col gap-1 rounded-md border border-red-200/70 bg-red-50/40 dark:border-red-800/40 dark:bg-red-900/10 px-2.5 py-2 opacity-60"
          >
            <div className="flex justify-between items-start gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-medium text-foreground line-through truncate" title={op.name}>
                  {op.name}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded bg-red-200 text-red-800 dark:bg-red-800/40 dark:text-red-300 flex-shrink-0">
                  Entfernt
                </span>
              </div>
              <span className="text-xs font-mono font-semibold text-muted-foreground line-through flex-shrink-0">
                {formatCurrency(op.amount, waehrung)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {participants.length > 0 && (
        <div className="border-t border-border/50 pt-2 space-y-1">
          {participants.map((name) => {
            const amt = Math.round(computeBetrag(positions, name) * 100) / 100;
            return (
              <div key={name} className="flex justify-between items-center text-xs">
                <span className="font-medium text-muted-foreground">{name}</span>
                <span className="font-mono font-semibold text-foreground">
                  {formatCurrency(amt, waehrung)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

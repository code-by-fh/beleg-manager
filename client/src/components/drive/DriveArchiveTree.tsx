import { useState } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArchiveYear } from "@/types/receipt";

const MONTH_NAMES: Record<string, string> = {
  "01": "Januar", "02": "Februar", "03": "März", "04": "April",
  "05": "Mai", "06": "Juni", "07": "Juli", "08": "August",
  "09": "September", "10": "Oktober", "11": "November", "12": "Dezember",
};

type Props = {
  years: ArchiveYear[];
  selectedFolderId: string | null;
  onSelectMonth: (folderId: string) => void;
};

export function DriveArchiveTree({ years, selectedFolderId, onSelectMonth }: Props) {
  const [expandedYears, setExpandedYears] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (years[0]) s.add(years[0].id);
    return s;
  });

  function toggleYear(yearId: string) {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(yearId)) next.delete(yearId);
      else next.add(yearId);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-0.5">
      {years.map((year) => {
        const expanded = expandedYears.has(year.id);
        return (
          <div key={year.id}>
            <button
              onClick={() => toggleYear(year.id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-[hsl(var(--muted))] transition-colors"
            >
              {expanded
                ? <ChevronDown className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
                : <ChevronRight className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />}
              {expanded
                ? <FolderOpen className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" />
                : <Folder className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />}
              <span>{year.name}</span>
            </button>
            {expanded && (
              <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-[hsl(var(--border))] pl-2">
                {year.months.length === 0 && (
                  <p className="px-2 py-1 text-xs text-[hsl(var(--muted-foreground))]">Leer</p>
                )}
                {year.months.map((month) => (
                  <button
                    key={month.id}
                    onClick={() => onSelectMonth(month.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                      selectedFolderId === month.id
                        ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-medium"
                        : "hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                    )}
                  >
                    <Folder className="h-3.5 w-3.5 shrink-0" />
                    <span>{MONTH_NAMES[month.name] ?? month.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

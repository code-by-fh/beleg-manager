import { Inbox, Loader2, Eye, Trash2, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { DriveInboxFile } from "@/types/receipt";

interface InboxListProps {
  files: DriveInboxFile[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  busyId: string | null;
  onImport: (id: string) => void;
  onDiscard: (id: string) => void;
  onPreview: (file: DriveInboxFile) => void;
  onRefetch: () => void;
}

export function InboxList({
  files, isLoading, isError, errorMessage, busyId,
  onImport, onDiscard, onPreview, onRefetch,
}: InboxListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 px-6 text-center">
        <p className="text-red-500/70 text-sm font-medium">Verbindung fehlgeschlagen</p>
        <p className="text-muted-foreground/50 text-xs">{errorMessage}</p>
        <button
          onClick={onRefetch}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
        >
          Erneut versuchen
        </button>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 px-6 text-center">
        <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center">
          <Inbox className="h-6 w-6 text-muted-foreground/30" />
        </div>
        <p className="text-muted-foreground/50 text-sm">Noch keine Belege in der Inbox</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      {files.map((f) => (
        <div
          key={f.id}
          className="bg-[var(--surface)] border border-border/40 rounded-xl p-3 flex items-center justify-between gap-3"
        >
          <div
            onClick={() => onPreview(f)}
            className="min-w-0 flex-1 cursor-pointer group hover:opacity-80 flex items-center gap-2.5"
          >
            <div className="relative flex-shrink-0">
              <FileText className="h-4 w-4 text-foreground/40 transition-transform duration-200 group-hover:scale-110" />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 dark:bg-black/95 rounded">
                <Eye className="h-3 w-3 text-foreground" />
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-foreground text-xs font-medium truncate group-hover:underline decoration-foreground/30">
                {f.name}
              </p>
              <p className={cn(
                "text-[10px] truncate",
                f.status === "failed" ? "text-red-500/70" : "text-muted-foreground/60",
              )}>
                {f.status === "pending_review" && "Bereit zum Review"}
                {f.status === "new" && "Wartet auf Verarbeitung"}
                {f.status === "failed" && "Verarbeitung fehlgeschlagen"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => onDiscard(f.id)}
              disabled={!!busyId}
              className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
              title="Beleg verwerfen"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onImport(f.id)}
              disabled={!!busyId}
              className={cn(
                "px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all duration-300",
                f.status === "pending_review"
                  ? "bg-foreground/15 text-foreground hover:bg-foreground/25"
                  : "bg-black/5 dark:bg-white/5 text-muted-foreground hover:text-foreground",
              )}
            >
              {busyId === f.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : f.status === "pending_review" ? "Review" : "Start"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

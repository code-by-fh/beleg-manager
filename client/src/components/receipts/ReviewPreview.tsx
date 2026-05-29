import { FileText } from "lucide-react";

interface ReviewPreviewProps {
  mimeType: string;
  previewUrl: string;
}

export function ReviewPreview({ mimeType, previewUrl }: ReviewPreviewProps) {
  return (
    <div className="flat-card overflow-hidden rounded-[32px] p-2 bg-[var(--surface)] border border-border/40">
      <div className="relative aspect-[1/1.4] w-full overflow-hidden rounded-[24px] bg-black/5 dark:bg-white/5 flex items-center justify-center border border-border/10">
        {mimeType.startsWith("image/") ? (
          <img
            src={previewUrl}
            alt="Beleg Vorschau"
            className="max-h-full max-w-full object-contain select-none transition-transform duration-300 hover:scale-[1.02]"
          />
        ) : mimeType === "application/pdf" ? (
          <iframe
            src={previewUrl}
            className="w-full h-full rounded-[20px] border-0"
            title="PDF Vorschau"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground p-8">
            <FileText className="h-10 w-10" />
            <span className="text-xs font-medium">Beleg-Datei</span>
          </div>
        )}
      </div>
      <div className="p-3 text-center">
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-primary/80 hover:text-primary transition-colors underline underline-offset-4 decoration-primary/20 hover:decoration-primary"
        >
          {mimeType === "application/pdf" ? "PDF in neuem Tab öffnen" : "Bild in neuem Tab öffnen"}
        </a>
      </div>
    </div>
  );
}

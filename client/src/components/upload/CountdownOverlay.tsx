import { X, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CountdownOverlayProps {
  file: File;
  countdown: number;
  previewUrl: string | null;
  onCancel: () => void;
}

const COUNTDOWN_SECONDS = 5;
const radius = 40;
const circumference = 2 * Math.PI * radius;

export function CountdownOverlay({ file, countdown, previewUrl, onCancel }: CountdownOverlayProps) {
  const progress = (countdown / COUNTDOWN_SECONDS) * circumference;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-6 px-6">
      <div className="relative">
        <svg width="80" height="80" className="-rotate-90">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="3" />
          <circle
            cx="40" cy="40" r={radius}
            fill="none"
            stroke="hsl(var(--foreground))"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            style={{ transition: "stroke-dashoffset 0.9s linear" }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-foreground">
          {countdown}
        </span>
      </div>

      {previewUrl ? (
        <img
          src={previewUrl}
          alt="Vorschau"
          className="max-h-[45vh] max-w-full object-contain rounded-2xl border border-border/20 shadow-lg"
        />
      ) : (
        <div className="w-20 h-20 rounded-2xl bg-foreground flex items-center justify-center">
          {file.type === "application/pdf" ? (
            <FileText className="h-8 w-8 text-background" />
          ) : (
            <Upload className="h-8 w-8 text-background" />
          )}
        </div>
      )}

      <div className="text-center space-y-1">
        <p className="text-foreground font-medium text-sm break-all max-w-xs">{file.name}</p>
        <p className="text-muted-foreground text-xs">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
        <p className="text-muted-foreground text-xs">
          Wird in {countdown} Sekunde{countdown !== 1 ? "n" : ""} hochgeladen…
        </p>
      </div>

      <Button variant="outline" onClick={onCancel} className="w-full max-w-xs">
        <X className="h-4 w-4 mr-2" />
        Abbrechen
      </Button>
    </div>
  );
}

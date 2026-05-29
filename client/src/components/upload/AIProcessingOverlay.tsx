import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface AIProcessingOverlayProps {
  isVisible: boolean;
  message?: string;
}

export function AIProcessingOverlay({ isVisible, message = "KI analysiert Beleg..." }: AIProcessingOverlayProps) {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-md" />

      {/* Card */}
      <div className="relative w-full max-w-sm flat-card rounded-[32px] p-8 overflow-hidden flex flex-col items-center gap-6">

        {/* Ambient glows */}
        <div className="absolute -top-16 -left-16 w-40 h-40 bg-[hsl(var(--foreground))]/15 blur-[50px] rounded-full" />
        <div className="absolute -bottom-16 -right-16 w-40 h-40 bg-[hsl(var(--foreground))]/10 blur-[50px] rounded-full" />

        {/* Spinner rings */}
        <div className="relative">
          <div className="w-24 h-24 rounded-full border-2 border-[hsl(var(--foreground))]/20 border-t-[hsl(var(--foreground))] animate-[spin_3s_linear_infinite]" />
          <div className="absolute inset-0 w-24 h-24 rounded-full border-2 border-[hsl(var(--foreground))]/10 border-b-[hsl(var(--foreground))]/60 animate-[spin_2s_linear_infinite_reverse]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-[hsl(var(--foreground))] flex items-center justify-center">
              <Sparkles className="h-7 w-7 text-white animate-pulse" />
            </div>
          </div>
        </div>

        {/* Text */}
        <div className="text-center space-y-2 relative z-10">
          <h2 className="text-xl font-black text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>{message}</h2>
          <p className="text-muted-foreground text-sm">
            Dies kann einen Moment dauern. Wir extrahieren alle wichtigen Daten für dich.
          </p>
        </div>

        {/* Progress track */}
        <div className="w-full h-1.5 rounded-full bg-black/5 dark:bg-white/5 overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[hsl(var(--foreground))] to-transparent w-1/2 animate-[shimmer_2s_infinite] -translate-x-full" />
        </div>

        {/* Step badges */}
        <div className="flex flex-wrap justify-center gap-2">
          {["Texterkennung", "Kategorisierung", "Extraktion"].map((step, i) => (
            <div
              key={step}
              className={cn(
                "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                "bg-[hsl(var(--foreground))]/10 text-[hsl(var(--foreground))] animate-pulse"
              )}
              style={{ animationDelay: `${i * 400}ms` }}
            >
              {step}
            </div>
          ))}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}} />
    </div>
  );
}

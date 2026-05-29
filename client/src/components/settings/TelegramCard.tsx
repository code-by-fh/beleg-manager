import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { settingsApi } from "@/api/settings";

export function TelegramCard() {
  const { toast } = useToast();
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramConfigured, setTelegramConfigured] = useState(false);
  const [telegramSaving, setTelegramSaving] = useState(false);

  useEffect(() => {
    settingsApi.getTelegram().then((r) => setTelegramConfigured(r.configured)).catch(() => {});
  }, []);

  async function saveTelegram() {
    setTelegramSaving(true);
    try {
      await settingsApi.setTelegramToken(telegramToken || null);
      setTelegramConfigured(!!telegramToken);
      setTelegramToken("");
      toast({ title: telegramToken ? "Telegram Bot gespeichert" : "Telegram Bot entfernt" });
    } catch {
      toast({ title: "Speichern fehlgeschlagen", variant: "destructive" });
    } finally {
      setTelegramSaving(false);
    }
  }

  async function removeTelegram() {
    setTelegramSaving(true);
    try {
      await settingsApi.setTelegramToken(null);
      setTelegramConfigured(false);
      toast({ title: "Telegram Bot entfernt" });
    } catch {
      toast({ title: "Speichern fehlgeschlagen", variant: "destructive" });
    } finally {
      setTelegramSaving(false);
    }
  }

  return (
    <div className="flat-card p-6 space-y-4 h-full flex flex-col">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[var(--active-bg)] flex items-center justify-center flex-shrink-0">
          <Send className="h-6 w-6 text-[hsl(var(--foreground))]" />
        </div>
        <div>
          <p className="text-foreground font-bold text-sm">Telegram Bot</p>
          <p className="text-muted-foreground text-xs font-medium">
            {telegramConfigured ? "Bot konfiguriert" : "Nicht konfiguriert"}
          </p>
        </div>
      </div>
      <div className="flex-grow space-y-4">
        <p className="text-muted-foreground text-xs leading-relaxed border-t border-border/40 pt-3">
          Schicke Fotos direkt per Telegram-Chat. Erstelle einen Bot bei <strong>@BotFather</strong>, kopiere den Token und trage ihn hier ein.
        </p>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Bot-Token</p>
          <Input
            type="password"
            placeholder={telegramConfigured ? "••••••••• (neuen Token eingeben zum Ändern)" : "123456789:ABCdef…"}
            value={telegramToken}
            onChange={(e) => setTelegramToken(e.target.value)}
            className="h-9 text-sm font-mono"
          />
        </div>
      </div>
      <div className="flex gap-2 mt-auto">
        <Button onClick={saveTelegram} disabled={telegramSaving || !telegramToken} size="sm" className="flex-1">
          {telegramSaving ? "Speichern…" : "Token speichern"}
        </Button>
        {telegramConfigured && (
          <Button
            variant="ghost"
            size="sm"
            disabled={telegramSaving}
            onClick={removeTelegram}
            className="text-muted-foreground"
          >
            Entfernen
          </Button>
        )}
      </div>
    </div>
  );
}

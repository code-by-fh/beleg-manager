import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useFactoryReset } from "@/hooks/useFactoryReset";
import { useToast } from "@/components/ui/use-toast";
import { settingsApi } from "@/api/settings";
import { User, AlertTriangle, LogOut, Mail, Send, Layout, LayoutGrid, LayoutList } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function SettingsPage() {
  const { user, logout } = useAuth();
  const { execute, loading } = useFactoryReset();
  const { toast } = useToast();

  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetOptions, setResetOptions] = useState({ localData: false, googleDrive: false });
  const [confirmChecked, setConfirmChecked] = useState(false);

  // Gmail settings
  const [gmailEnabled, setGmailEnabled] = useState(false);
  const [gmailLabel, setGmailLabel] = useState("");
  const [gmailSaving, setGmailSaving] = useState(false);

  // Telegram settings
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramConfigured, setTelegramConfigured] = useState(false);
  const [telegramSaving, setTelegramSaving] = useState(false);

  // UI settings
  const qc = useQueryClient();
  const { data: uiSettings } = useQuery({
    queryKey: ["ui-settings"],
    queryFn: () => settingsApi.getUI(),
  });
  const [viewMode, setViewMode] = useState<"table" | "list">("table");
  const [uiSaving, setUISaving] = useState(false);

  useEffect(() => {
    settingsApi.getGmail().then((r) => { setGmailEnabled(r.enabled); setGmailLabel(r.labelFilter); }).catch(() => {});
    settingsApi.getTelegram().then((r) => setTelegramConfigured(r.configured)).catch(() => {});
    if (uiSettings) setViewMode(uiSettings.receiptsViewMode);
  }, [uiSettings]);

  async function saveGmail() {
    setGmailSaving(true);
    try {
      await settingsApi.setGmail(gmailEnabled, gmailLabel);
      toast({ title: "Gmail-Einstellungen gespeichert" });
    } catch {
      toast({ title: "Speichern fehlgeschlagen", variant: "destructive" });
    } finally {
      setGmailSaving(false);
    }
  }

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

  async function saveUI(mode: "table" | "list") {
    setUISaving(true);
    setViewMode(mode);
    try {
      await settingsApi.setUI(mode);
      qc.invalidateQueries({ queryKey: ["ui-settings"] });
      toast({ title: "Anzeige-Einstellungen gespeichert" });
    } catch {
      toast({ title: "Speichern fehlgeschlagen", variant: "destructive" });
    } finally {
      setUISaving(false);
    }
  }

  const hasResetOptions = resetOptions.localData || resetOptions.googleDrive;

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-5xl mx-auto px-4 py-6 pb-10">
        <h1
          className="text-2xl font-black gradient-text mb-8"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          Einstellungen
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Account card */}
          <div className="clay-card-static p-6 space-y-4 h-full flex flex-col">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[var(--active-bg)] flex items-center justify-center flex-shrink-0">
                <User className="h-6 w-6 text-[hsl(var(--foreground))]" />
              </div>
              <div>
                <p className="text-foreground font-bold text-sm">Konto</p>
                <p className="text-muted-foreground text-xs font-medium">{user?.email}</p>
              </div>
            </div>
            <p className="text-muted-foreground text-xs leading-relaxed border-t border-border/40 pt-3 flex-grow">
              Beim ersten Login wurden{" "}
              <code className="text-primary font-bold bg-primary/8 px-1.5 py-0.5 rounded-lg">Beleg-Manager/Inbox</code> und{" "}
              <code className="text-primary font-bold bg-primary/8 px-1.5 py-0.5 rounded-lg">Archive/</code> sowie das Sheet{" "}
              <code className="text-primary font-bold bg-primary/8 px-1.5 py-0.5 rounded-lg">belege</code> in deinem Drive angelegt.
              Belege im Inbox-Ordner werden alle 5 Minuten automatisch verarbeitet.
            </p>
            <Button variant="ghost" size="sm" onClick={logout} className="w-full gap-2 text-sm mt-auto">
              <LogOut className="h-4 w-4" /> Abmelden
            </Button>
          </div>

          {/* Gmail Polling */}
          <div className="clay-card-static p-6 space-y-4 h-full flex flex-col">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[var(--active-bg)] flex items-center justify-center flex-shrink-0">
                <Mail className="h-6 w-6 text-[hsl(var(--foreground))]" />
              </div>
              <div>
                <p className="text-foreground font-bold text-sm">Gmail-Weiterleitung</p>
                <p className="text-muted-foreground text-xs font-medium">
                  {gmailEnabled ? "Aktiv — alle 5 Minuten" : "Deaktiviert"}
                </p>
              </div>
            </div>
            <p className="text-muted-foreground text-xs leading-relaxed border-t border-border/40 pt-3 flex-grow">
              Ungelesene E-Mails mit Anhang werden automatisch als Belege importiert. Leite einfach Rechnungs-Mails an dein Google-Konto weiter.
              <br />
              <span className="text-yellow-600 dark:text-yellow-400 font-medium">Hinweis: Erfordert einmalige Re-Anmeldung für Gmail-Zugriff.</span>
            </p>
            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox
                checked={gmailEnabled}
                onCheckedChange={(v: boolean) => setGmailEnabled(v)}
              />
              <span className="text-sm text-foreground">Polling aktivieren</span>
            </label>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Label-Filter (optional, z.B. <code className="text-primary">belege</code>)</p>
              <Input
                placeholder="Leer = alle Mails mit Anhang"
                value={gmailLabel}
                onChange={(e) => setGmailLabel(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <Button onClick={saveGmail} disabled={gmailSaving} size="sm" className="w-full mt-auto">
              {gmailSaving ? "Speichern…" : "Speichern"}
            </Button>
          </div>

          {/* Telegram Bot */}
          <div className="clay-card-static p-6 space-y-4 h-full flex flex-col">
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

          {/* UI Settings */}
          <div className="clay-card-static p-6 space-y-4 h-full flex flex-col">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[var(--active-bg)] flex items-center justify-center flex-shrink-0">
                <Layout className="h-6 w-6 text-[hsl(var(--foreground))]" />
              </div>
              <div>
                <p className="text-foreground font-bold text-sm">Anzeige</p>
                <p className="text-muted-foreground text-xs font-medium">Standard-Ansicht für Belege</p>
              </div>
            </div>
            <div className="flex-grow space-y-4">
              <p className="text-muted-foreground text-xs leading-relaxed border-t border-border/40 pt-3">
                Wähle, wie Belege standardmäßig angezeigt werden sollen. Die Listenansicht ist besonders für mobile Geräte optimiert.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => saveUI("table")}
                  disabled={uiSaving}
                  className={`flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                    viewMode === "table"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border"
                  }`}
                >
                  <div className={`p-2 rounded-xl ${viewMode === "table" ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                    <LayoutGrid className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-bold">Tabelle</span>
                </button>
                <button
                  onClick={() => saveUI("list")}
                  disabled={uiSaving}
                  className={`flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                    viewMode === "list"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border"
                  }`}
                >
                  <div className={`p-2 rounded-xl ${viewMode === "list" ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                    <LayoutList className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-bold">Liste (Mobil)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Danger zone */}
          <div className="clay-card-static p-6 space-y-4 border-2 border-red-200/60 dark:border-red-500/20 h-full flex flex-col">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-red-600 dark:text-red-400 font-bold text-sm">Gefahrenzone</p>
                <p className="text-red-500/70 dark:text-red-400/60 text-xs font-medium">Nicht rückgängig machbar</p>
              </div>
            </div>

            <div className="flex-grow space-y-3 border-t border-red-200/50 dark:border-red-500/15 pt-3">
              {[
                { id: "reset-local",  key: "localData",    label: "Lokale Daten löschen",       desc: "Löscht SQLite-DB und Sessions" },
                { id: "reset-google", key: "googleDrive",  label: "Google Drive Daten löschen", desc: "Löscht Ordner und Sheet aus Drive" },
              ].map(({ id, key, label, desc }) => (
                <label key={id} htmlFor={id} className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    id={id}
                    checked={resetOptions[key as keyof typeof resetOptions]}
                    onCheckedChange={(v: boolean) => setResetOptions((p) => ({ ...p, [key]: v }))}
                    className="mt-0.5 border-red-300 dark:border-red-500/40 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                  />
                  <div>
                    <p className="text-foreground text-sm font-bold">{label}</p>
                    <p className="text-muted-foreground text-xs">{desc}</p>
                  </div>
                </label>
              ))}
            </div>

            <Button
              onClick={() => { setResetDialogOpen(true); setConfirmChecked(false); }}
              disabled={!hasResetOptions || loading}
              className="w-full bg-gradient-to-br from-red-400 to-red-600 text-white rounded-[20px] h-14 font-bold mt-auto"
            >
              {loading ? "Wird verarbeitet…" : "Factory Reset starten"}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle
              className="text-red-600 dark:text-red-400"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              Factory Reset bestätigen
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Folgende Daten werden unwiderruflich gelöscht:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2 text-sm text-foreground/80">
            {resetOptions.localData   && <p>• Lokale Daten (SQLite-DB + Sessions)</p>}
            {resetOptions.googleDrive && <p>• Beleg-Manager Ordner + Sheet aus Google Drive</p>}
          </div>
          <label htmlFor="confirm-understand" className="flex items-start gap-3 cursor-pointer py-3 border-t border-border/40">
            <Checkbox
              id="confirm-understand"
              checked={confirmChecked}
              onCheckedChange={setConfirmChecked}
              className="mt-0.5 border-red-300 dark:border-red-500/40 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
            />
            <span className="text-muted-foreground text-sm">Ich verstehe, dass dies nicht rückgängig gemacht werden kann</span>
          </label>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setResetDialogOpen(false)} className="flex-1">Abbrechen</Button>
            <Button
              onClick={async () => { setResetDialogOpen(false); await execute(resetOptions); }}
              disabled={!confirmChecked || loading}
              className="flex-1 bg-gradient-to-br from-red-400 to-red-600 text-white rounded-[20px] h-14 font-bold"
            >
              Bestätigen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

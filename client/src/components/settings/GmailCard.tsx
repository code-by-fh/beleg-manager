import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Mail } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { settingsApi } from "@/api/settings";

export function GmailCard() {
  const { toast } = useToast();
  const [gmailEnabled, setGmailEnabled] = useState(false);
  const [gmailLabel, setGmailLabel] = useState("");
  const [gmailSaving, setGmailSaving] = useState(false);

  useEffect(() => {
    settingsApi.getGmail().then((r) => { 
      setGmailEnabled(r.enabled); 
      setGmailLabel(r.labelFilter); 
    }).catch(() => {});
  }, []);

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

  return (
    <div className="flat-card p-6 space-y-4 h-full flex flex-col">
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
  );
}

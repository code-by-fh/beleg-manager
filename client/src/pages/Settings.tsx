import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useFactoryReset } from "@/hooks/useFactoryReset";
import { User, AlertTriangle, LogOut } from "lucide-react";

export function SettingsPage() {
  const { user, logout } = useAuth();
  const { execute, loading } = useFactoryReset();

  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetOptions, setResetOptions] = useState({ localData: false, googleDrive: false });
  const [confirmChecked, setConfirmChecked] = useState(false);

  const hasResetOptions = resetOptions.localData || resetOptions.googleDrive;

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5 pb-10">
        <h1
          className="text-2xl font-black gradient-text"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          Einstellungen
        </h1>

        {/* Account card */}
        <div className="clay-card-static p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[var(--active-bg)] flex items-center justify-center flex-shrink-0">
              <User className="h-6 w-6 text-[hsl(var(--foreground))]" />
            </div>
            <div>
              <p className="text-foreground font-bold text-sm">Konto</p>
              <p className="text-muted-foreground text-xs font-medium">{user?.email}</p>
            </div>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed border-t border-border/40 pt-3">
            Beim ersten Login wurden{" "}
            <code className="text-primary font-bold bg-primary/8 px-1.5 py-0.5 rounded-lg">Beleg-Manager/Inbox</code> und{" "}
            <code className="text-primary font-bold bg-primary/8 px-1.5 py-0.5 rounded-lg">Archive/</code> sowie das Sheet{" "}
            <code className="text-primary font-bold bg-primary/8 px-1.5 py-0.5 rounded-lg">belege</code> in deinem Drive angelegt.
            Belege im Inbox-Ordner werden alle 5 Minuten automatisch verarbeitet.
          </p>
          <Button variant="ghost" size="sm" onClick={logout} className="w-full gap-2 text-sm">
            <LogOut className="h-4 w-4" /> Abmelden
          </Button>
        </div>

        {/* Danger zone */}
        <div className="clay-card-static p-6 space-y-4 border-2 border-red-200/60 dark:border-red-500/20">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-red-600 dark:text-red-400 font-bold text-sm">Gefahrenzone</p>
              <p className="text-red-500/70 dark:text-red-400/60 text-xs font-medium">Nicht rückgängig machbar</p>
            </div>
          </div>

          <div className="space-y-3 border-t border-red-200/50 dark:border-red-500/15 pt-3">
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
            className="w-full bg-gradient-to-br from-red-400 to-red-600 text-white rounded-[20px] h-14 font-bold"
          >
            {loading ? "Wird verarbeitet…" : "Factory Reset starten"}
          </Button>
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

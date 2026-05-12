import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useFactoryReset } from "@/hooks/useFactoryReset";

export function SettingsPage() {
  const { user } = useAuth();
  const { execute, loading } = useFactoryReset();

  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetOptions, setResetOptions] = useState({
    localData: false,
    googleDrive: false,
  });
  const [confirmChecked, setConfirmChecked] = useState(false);

  const hasResetOptions = resetOptions.localData || resetOptions.googleDrive;

  const handleResetStart = () => {
    if (!hasResetOptions) return;
    setResetDialogOpen(true);
    setConfirmChecked(false);
  };

  const handleResetConfirm = async () => {
    if (!confirmChecked || !hasResetOptions) return;
    setResetDialogOpen(false);
    await execute(resetOptions);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Einstellungen</h1>
      <Card>
        <CardHeader>
          <CardTitle>Konto</CardTitle>
          <CardDescription>
            Du bist angemeldet als <span className="font-medium">{user?.email}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Beim ersten Login hat die App in deinem Drive den Ordner <code>Beleg-Manager/</code> mit
            Unterordnern <code>Inbox/</code> und <code>Archive/</code> sowie das Sheet <code>belege</code> angelegt.
            Belege im Inbox-Ordner werden alle 5 Minuten automatisch verarbeitet.
          </p>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="text-red-900">Gefahrenzone</CardTitle>
          <CardDescription className="text-red-800">
            Folgende Operationen können nicht rückgängig gemacht werden.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="reset-local"
                checked={resetOptions.localData}
                onCheckedChange={(checked: boolean) =>
                  setResetOptions((prev) => ({ ...prev, localData: checked }))
                }
              />
              <label
                htmlFor="reset-local"
                className="text-sm font-medium text-gray-900 cursor-pointer"
              >
                Lokale Daten löschen
              </label>
            </div>
            <p className="text-xs text-gray-600 ml-6">
              Löscht die lokale Datenbank und alle Sessions
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="reset-google"
                checked={resetOptions.googleDrive}
                onCheckedChange={(checked: boolean) =>
                  setResetOptions((prev) => ({ ...prev, googleDrive: checked }))
                }
              />
              <label
                htmlFor="reset-google"
                className="text-sm font-medium text-gray-900 cursor-pointer"
              >
                Google Drive Daten löschen
              </label>
            </div>
            <p className="text-xs text-gray-600 ml-6">
              Löscht den Beleg-Manager-Ordner und das Sheet aus deinem Google Drive
            </p>
          </div>

          <Button
            variant="destructive"
            onClick={handleResetStart}
            disabled={!hasResetOptions || loading}
            className="mt-4"
          >
            {loading ? "Wird verarbeitet..." : "Factory Reset starten"}
          </Button>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-900">Factory Reset bestätigen</DialogTitle>
            <DialogDescription className="text-red-800">
              Folgende Daten werden gelöscht:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            {resetOptions.localData && (
              <div className="text-sm">
                • Lokale Daten (SQLite-DB und Sessions)
              </div>
            )}
            {resetOptions.googleDrive && (
              <div className="text-sm">
                • Google Drive Beleg-Manager-Ordner<br/>
                <span className="ml-4">- Ordner Archive/ und Inbox/</span><br/>
                <span className="ml-4">- Sheet belege.xlsx</span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2 py-4 border-t">
            <Checkbox
              id="confirm-understand"
              checked={confirmChecked}
              onCheckedChange={setConfirmChecked}
            />
            <label
              htmlFor="confirm-understand"
              className="text-sm text-gray-900 cursor-pointer"
            >
              Ich verstehe, dass dies nicht rückgängig gemacht werden kann
            </label>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setResetDialogOpen(false)}
              disabled={loading}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleResetConfirm}
              disabled={!confirmChecked || loading}
              className="flex-1"
            >
              {loading ? "Wird verarbeitet..." : "Bestätigen"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

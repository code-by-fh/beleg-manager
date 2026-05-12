import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";

export function SettingsPage() {
  const { user } = useAuth();
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Einstellungen</h1>
      <Card>
        <CardHeader>
          <CardTitle>Konto</CardTitle>
          <CardDescription>Du bist angemeldet als <span className="font-medium">{user?.email}</span>.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Beim ersten Login hat die App in deinem Drive den Ordner <code>Beleg-Manager/</code> mit
            Unterordnern <code>Inbox/</code> und <code>Archive/</code> sowie das Sheet <code>belege</code> angelegt.
            Belege im Inbox-Ordner werden alle 5 Minuten automatisch verarbeitet.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function LoginPage() {
  return (
    <main className="container mx-auto flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Beleg-Manager</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Melde dich mit deinem Google-Konto an, um Belege per Foto, Sprache oder Drive-Inbox zu erfassen.
          </p>
          <Button asChild className="w-full">
            <a href="/api/auth/google">Mit Google anmelden</a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

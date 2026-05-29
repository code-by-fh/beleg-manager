import { Button } from "@/components/ui/button";
import { User, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function AccountCard() {
  const { user, logout } = useAuth();
  
  return (
    <div className="flat-card p-6 space-y-4 h-full flex flex-col">
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
  );
}

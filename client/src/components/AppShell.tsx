import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AppShell() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto flex h-14 items-center justify-between">
          <Link to="/" className="font-semibold">Beleg-Manager</Link>
          <nav className="flex gap-2">
            {[
              { to: "/", label: "Dashboard" },
              { to: "/upload", label: "Erfassen" },
              { to: "/settings", label: "Einstellungen" },
            ].map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                className={({ isActive }) =>
                  cn("px-3 py-1.5 text-sm rounded-md", isActive ? "bg-secondary" : "hover:bg-secondary/50")
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground hidden sm:inline">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={logout}>Abmelden</Button>
          </div>
        </div>
      </header>
      <main className="container mx-auto flex-1 py-8">
        <Outlet />
      </main>
    </div>
  );
}

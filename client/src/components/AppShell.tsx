import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { LayoutDashboard, PlusCircle, Settings, Sun, Moon, LogOut, Bell, Zap, Receipt, SplitSquareHorizontal, ArrowLeftRight } from "lucide-react";
import { useDriveInbox } from "@/hooks/useDriveInbox";

const navItems = [
  { to: "/",         label: "Dashboard",    icon: LayoutDashboard         },
  { to: "/receipts", label: "Belege",       icon: Receipt                 },
  { to: "/splits",   label: "Aufteilungen", icon: SplitSquareHorizontal   },
  { to: "/kontoabgleich", label: "Kontoabgleich", icon: ArrowLeftRight      },
  { to: "/upload",   label: "Erfassen",     icon: PlusCircle              },
  { to: "/settings", label: "Einstellungen", icon: Settings               },
];

const PAGE_TITLES: Record<string, string> = {
  "/":          "Dashboard",
  "/receipts":  "Belege",
  "/splits":    "Aufteilungen",
  "/upload":          "Erfassen",
  "/kontoabgleich":   "Kontoabgleich",
  "/review":          "Prüfen",
  "/settings":        "Einstellungen",
};

export function AppShell() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname] ?? "Beleg Manager";
  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  const { data: inboxData } = useDriveInbox();
  const inboxCount = inboxData?.files?.length ?? 0;

  return (
    <div className="h-screen-safe flex bg-[hsl(var(--background))] w-full">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-[var(--surface)] border-r border-[hsl(var(--border))] py-6 px-4 flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-2 mb-8">
          <Zap className="w-5 h-5 text-[hsl(var(--foreground))]" strokeWidth={2} />
          <span className="font-semibold text-base text-[hsl(var(--foreground))]">Beleg Manager</span>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150",
                  isActive
                    ? "bg-[var(--active-bg)] text-[hsl(var(--foreground))] font-medium"
                    : "text-[hsl(var(--muted-foreground))] hover:bg-[var(--hover-bg)] hover:text-[hsl(var(--foreground))]"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={18} strokeWidth={isActive ? 2 : 1.5} />
                  <span className="flex-1">{item.label}</span>
                  {item.to === "/upload" && inboxCount > 0 && (
                    <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                      {inboxCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>


        {/* User / Logout */}
        <div className="mt-auto pt-4 border-t border-[hsl(var(--border))]">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-[var(--active-bg)] flex items-center justify-center text-xs font-semibold text-[hsl(var(--foreground))] flex-shrink-0">
              {initials}
            </div>
            <span className="text-xs text-[hsl(var(--muted-foreground))] truncate flex-1 min-w-0">
              {user?.email ?? ""}
            </span>
            <button
              onClick={logout}
              className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors flex-shrink-0"
              title="Abmelden"
            >
              <LogOut size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[hsl(var(--background))]">
        {/* Top Bar */}
        <header className="flex-shrink-0 h-16 px-8 flex items-center justify-between bg-[var(--surface)] border-b border-[hsl(var(--border))]">
          <span className="text-base font-semibold text-[hsl(var(--foreground))]">{pageTitle}</span>

          <div className="flex items-center gap-3">
            <Link
              to="/upload"
              className="h-9 px-4 rounded-lg bg-[hsl(var(--foreground))] text-[hsl(var(--background))] text-sm font-medium flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <PlusCircle size={16} />
              <span className="hidden sm:inline">Neuer Beleg</span>
            </Link>

            <button aria-label="Benachrichtigungen" className="h-9 w-9 rounded-lg border border-[hsl(var(--border))] flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors relative">
              <Bell size={16} strokeWidth={1.5} />
              <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[hsl(var(--foreground))]" />
            </button>

            <button
              onClick={toggle}
              className="h-9 w-9 rounded-lg border border-[hsl(var(--border))] flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
              aria-label="Theme wechseln"
            >
              {theme === "dark" ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
            </button>

            <div className="h-9 w-9 rounded-full bg-[var(--active-bg)] text-[hsl(var(--foreground))] flex items-center justify-center font-semibold text-xs">
              {initials}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto px-8 py-8 pb-24 md:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden bg-[var(--surface)] border-t border-[hsl(var(--border))] absolute bottom-0 w-full z-30"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Mobile Navigation"
      >
        <div className="flex px-2 py-2">
          {navItems.map(({ to, label, icon: Icon }) => {
            const isActive = to === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors",
                  isActive
                    ? "text-[hsl(var(--foreground))]"
                    : "text-[hsl(var(--muted-foreground))]"
                )}
              >
                <div className={cn("p-1.5 rounded-lg relative", isActive ? "bg-[var(--active-bg)]" : "")}>
                  <Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
                  {to === "/upload" && inboxCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[8px] flex items-center justify-center rounded-full font-bold border-2 border-[var(--surface)]">
                      {inboxCount}
                    </span>
                  )}
                </div>
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

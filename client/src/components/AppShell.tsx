import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { LayoutDashboard, PlusCircle, Settings, Sun, Moon, LogOut, Bell, Zap, Receipt, SplitSquareHorizontal, ArrowLeftRight, MoreHorizontal, X, HandCoins } from "lucide-react";
import { useDriveInbox } from "@/hooks/useDriveInbox";
import { usePendingCount } from "@/hooks/useSplitRequests";
import { useFailedVoiceJobs } from "@/hooks/useFailedVoiceJobs";
import { useState } from "react";

const navItems = [
  { to: "/",         label: "Dashboard",    icon: LayoutDashboard         },
  { to: "/receipts", label: "Belege",       icon: Receipt                 },
  { to: "/splits",   label: "Aufteilungen", icon: SplitSquareHorizontal   },
  { to: "/requests", label: "Anforderungen", icon: HandCoins              },
  { to: "/kontoabgleich", label: "Kontoabgleich", icon: ArrowLeftRight      },
  { to: "/upload",   label: "Erfassen",     icon: PlusCircle              },
  { to: "/settings", label: "Einstellungen", icon: Settings               },
];

const PAGE_TITLES: Record<string, string> = {
  "/":          "Dashboard",
  "/receipts":  "Belege",
  "/splits":    "Aufteilungen",
  "/requests":  "Anforderungen",
  "/upload":          "Erfassen",
  "/kontoabgleich":   "Kontoabgleich",
  "/review":          "Prüfen",
  "/settings":        "Einstellungen",
};

const moreItems = [
  { to: "/splits",        label: "Aufteilungen",  icon: SplitSquareHorizontal },
  { to: "/kontoabgleich", label: "Kontoabgleich", icon: ArrowLeftRight        },
  { to: "/settings",      label: "Einstellungen", icon: Settings              },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname] ?? "Beleg Manager";
  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const { data: inboxData } = useDriveInbox();
  const { data: failedVoiceData } = useFailedVoiceJobs();
  const pendingRequestCount = usePendingCount().data ?? 0;
  const inboxCount = inboxData?.files?.length ?? 0;
  const failedVoiceCount = failedVoiceData?.jobs?.length ?? 0;
  const failedDriveCount = (inboxData?.files ?? []).filter((f) => f.status === "failed").length;
  const failedCount = failedVoiceCount + failedDriveCount;

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
                  {item.to === "/receipts" && failedCount > 0 && (
                    <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                      {failedCount}
                    </span>
                  )}
                  {item.to === "/upload" && inboxCount > 0 && (
                    <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                      {inboxCount}
                    </span>
                  )}
                  {item.to === "/requests" && pendingRequestCount > 0 && (
                    <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                      {pendingRequestCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>


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

            <div className="relative">
              <button
                onClick={() => setAccountOpen(!accountOpen)}
                className="h-9 w-9 rounded-full bg-[var(--active-bg)] text-[hsl(var(--foreground))] flex items-center justify-center font-semibold text-xs hover:ring-2 hover:ring-[hsl(var(--border))] transition-all focus:outline-none"
                aria-label="Konto-Menü"
              >
                {initials}
              </button>

              {accountOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setAccountOpen(false)} 
                  />
                  <div className="absolute right-0 mt-2 w-56 bg-[var(--surface)] border border-[hsl(var(--border))] rounded-xl shadow-lg py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-4 py-3 border-b border-[hsl(var(--border))] mb-1">
                      <p className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1">Konto</p>
                      <p className="text-sm font-medium text-[hsl(var(--foreground))] truncate">{user?.email}</p>
                    </div>
                    
                    <Link
                      to="/settings"
                      onClick={() => setAccountOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-[hsl(var(--muted-foreground))] hover:bg-[var(--hover-bg)] hover:text-[hsl(var(--foreground))] transition-colors"
                    >
                      <Settings size={16} strokeWidth={1.5} />
                      <span>Einstellungen</span>
                    </Link>

                    <button
                      onClick={() => { logout(); setAccountOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      <LogOut size={16} strokeWidth={1.5} />
                      <span>Abmelden</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto px-8 py-8 pb-24 md:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile "Mehr" overlay */}
      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 z-40"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+64px)] left-0 right-0 mx-4 bg-[var(--surface)] border border-[hsl(var(--border))] rounded-2xl shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--border))]">
              <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Weitere</span>
              <button onClick={() => setMoreOpen(false)} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
                <X size={16} />
              </button>
            </div>
            {moreItems.map(({ to, label, icon: Icon }) => {
              const isActive = location.pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3.5 text-sm transition-colors",
                    isActive
                      ? "bg-[var(--active-bg)] text-[hsl(var(--foreground))] font-medium"
                      : "text-[hsl(var(--muted-foreground))] hover:bg-[var(--hover-bg)] hover:text-[hsl(var(--foreground))]"
                  )}
                >
                  <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
                  <span>{label}</span>
                </Link>
              );
            })}
            <div className="border-t border-[hsl(var(--border))]">
              <button
                onClick={() => { logout(); setMoreOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-[hsl(var(--muted-foreground))] hover:bg-[var(--hover-bg)] hover:text-[hsl(var(--foreground))] transition-colors"
              >
                <LogOut size={18} strokeWidth={1.5} />
                <span>Abmelden</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden bg-[var(--surface)] border-t border-[hsl(var(--border))] absolute bottom-0 w-full z-30"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Mobile Navigation"
      >
        <div className="flex px-2 py-2">
          {[
            { to: "/",         label: "Dashboard", icon: LayoutDashboard },
            { to: "/receipts", label: "Belege",    icon: Receipt         },
            { to: "/upload",   label: "Erfassen",  icon: PlusCircle      },
          ].map(({ to, label, icon: Icon }) => {
            const isActive = to === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setMoreOpen(false)}
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
                  {to === "/receipts" && failedCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] flex items-center justify-center rounded-full font-bold border-2 border-[var(--surface)]">
                      {failedCount}
                    </span>
                  )}
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

          {/* Mehr Button */}
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors",
              moreOpen || moreItems.some((i) => location.pathname.startsWith(i.to))
                ? "text-[hsl(var(--foreground))]"
                : "text-[hsl(var(--muted-foreground))]"
            )}
          >
            <div className={cn(
              "p-1.5 rounded-lg",
              moreOpen || moreItems.some((i) => location.pathname.startsWith(i.to)) ? "bg-[var(--active-bg)]" : ""
            )}>
              <MoreHorizontal size={20} strokeWidth={1.5} />
            </div>
            <span>Mehr</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

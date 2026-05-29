import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  PlusCircle,
  Settings,
  Sun,
  Moon,
  LogOut,
  Bell,
  Zap,
  Receipt,
  ArrowLeftRight,
  Menu,
  X,
  HandCoins,
  Activity,
} from "lucide-react";
import { useDriveInbox } from "@/hooks/useDriveInbox";
import { usePendingCount } from "@/hooks/useSplitRequests";
import { useFailedVoiceJobs } from "@/hooks/useFailedVoiceJobs";
import { useState } from "react";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/receipts", label: "Belege", icon: Receipt },
  { to: "/requests", label: "Aufteilungen", icon: HandCoins },
  { to: "/kontoabgleich", label: "Kontoabgleich", icon: ArrowLeftRight },
  { to: "/upload", label: "Erfassen", icon: PlusCircle },
  { to: "/monitoring", label: "Monitoring", icon: Activity },
  { to: "/settings", label: "Einstellungen", icon: Settings },
];

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/dashboard": "Dashboard",
  "/receipts": "Belege",
  "/requests": "Aufteilungen",
  "/upload": "Erfassen",
  "/kontoabgleich": "Kontoabgleich",
  "/review": "Prüfen",
  "/settings": "Einstellungen",
  "/monitoring": "Monitoring",
};

const hamburgerItems = navItems.filter((item) => item.to !== "/settings");

export function AppShell() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname] ?? "Beleg Manager";
  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const { data: inboxData } = useDriveInbox();
  const { data: failedVoiceData } = useFailedVoiceJobs();
  const pendingRequestCount = usePendingCount().data ?? 0;
  const inboxCount = inboxData?.files?.length ?? 0;
  const failedVoiceCount = failedVoiceData?.jobs?.length ?? 0;
  const failedDriveCount = (inboxData?.files ?? []).filter(
    (f) => f.status === "failed",
  ).length;
  const failedCount = failedVoiceCount + failedDriveCount;

  return (
    <div className="h-screen-safe flex bg-[hsl(var(--background))] w-full">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-[var(--surface)] border-r border-[hsl(var(--border))] py-6 px-4 flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-2 mb-8">
          <Zap
            className="w-5 h-5 text-[hsl(var(--foreground))]"
            strokeWidth={2}
          />
          <span className="font-semibold text-base text-[hsl(var(--foreground))]">
            Beleg Manager
          </span>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/" || item.to === "/dashboard"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150",
                  isActive
                    ? "bg-[var(--active-bg)] text-[hsl(var(--foreground))] font-medium"
                    : "text-[hsl(var(--muted-foreground))] hover:bg-[var(--hover-bg)] hover:text-[hsl(var(--foreground))]",
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
        <header className="flex-shrink-0 h-16 px-4 md:px-8 flex items-center justify-between bg-[var(--surface)] border-b border-[hsl(var(--border))]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMenuOpen(true)}
              className="md:hidden h-9 w-9 rounded-lg flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
              aria-label="Menü öffnen"
            >
              <Menu size={20} strokeWidth={1.5} />
            </button>
            <span className="text-base font-semibold text-[hsl(var(--foreground))]">
              {pageTitle}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/upload"
              className="h-9 px-4 rounded-lg bg-[hsl(var(--foreground))] text-[hsl(var(--background))] text-sm font-medium flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <PlusCircle size={16} />
              <span className="hidden sm:inline">Neuer Beleg</span>
            </Link>

            <button
              aria-label="Benachrichtigungen"
              className="h-9 w-9 rounded-lg border border-[hsl(var(--border))] flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors relative"
            >
              <Bell size={16} strokeWidth={1.5} />
              <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[hsl(var(--foreground))]" />
            </button>

            <button
              onClick={toggle}
              className="h-9 w-9 rounded-lg border border-[hsl(var(--border))] flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
              aria-label="Theme wechseln"
            >
              {theme === "dark" ? (
                <Sun size={16} strokeWidth={1.5} />
              ) : (
                <Moon size={16} strokeWidth={1.5} />
              )}
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
                      <p className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1">
                        Konto
                      </p>
                      <p className="text-sm font-medium text-[hsl(var(--foreground))] truncate">
                        {user?.email}
                      </p>
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
                      onClick={() => {
                        logout();
                        setAccountOpen(false);
                      }}
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
        <main className="flex-1 overflow-auto px-4 md:px-8 py-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile Hamburger Menu */}
      {menuOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/50"
            onClick={() => setMenuOpen(false)}
          />
          <div className="md:hidden fixed top-0 left-0 h-full w-72 bg-[var(--surface)] border-r border-[hsl(var(--border))] z-50 flex flex-col">
            <div className="flex items-center justify-between px-4 py-4 border-b border-[hsl(var(--border))]">
              <div className="flex items-center gap-2.5">
                <Zap className="w-5 h-5 text-[hsl(var(--foreground))]" strokeWidth={2} />
                <span className="font-semibold text-base text-[hsl(var(--foreground))]">
                  Beleg Manager
                </span>
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                aria-label="Menü schließen"
              >
                <X size={20} />
              </button>
            </div>
            <nav className="flex flex-col gap-1 p-4 flex-1 overflow-y-auto">
              {hamburgerItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/" || item.to === "/dashboard"}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150",
                      isActive
                        ? "bg-[var(--active-bg)] text-[hsl(var(--foreground))] font-medium"
                        : "text-[hsl(var(--muted-foreground))] hover:bg-[var(--hover-bg)] hover:text-[hsl(var(--foreground))]",
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
          </div>
        </>
      )}
    </div>
  );
}

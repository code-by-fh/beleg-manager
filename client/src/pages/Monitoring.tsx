import { useMonitoringHealth } from "@/hooks/useMonitoring";
import type { HealthEntry, ServiceStatus } from "@/api/monitoring";
import { CheckCircle, XCircle, HelpCircle, RefreshCw } from "lucide-react";

const SERVICE_LABELS: Record<string, string> = {
  "drive-inbox-poller": "Drive Inbox Poller",
  "gmail-poller":       "Gmail Poller",
  "telegram-bot":       "Telegram Bot",
  "gemini-extraction":  "Gemini AI Extraction",
};

const ALL_SERVICES = Object.keys(SERVICE_LABELS);

function StatusIcon({ status }: { status: ServiceStatus }) {
  if (status === "ok")    return <CheckCircle className="w-5 h-5 text-green-500" />;
  if (status === "error") return <XCircle     className="w-5 h-5 text-red-500"   />;
  return                         <HelpCircle  className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />;
}

function statusBadgeClass(status: ServiceStatus) {
  const base = "text-[10px] font-black uppercase tracking-[0.15em] px-2 py-0.5 rounded-full";
  if (status === "ok")    return `${base} bg-green-500/10 text-green-500`;
  if (status === "error") return `${base} bg-red-500/10 text-red-500`;
  return                         `${base} bg-[hsl(var(--muted-foreground))]/10 text-[hsl(var(--muted-foreground))]`;
}

function statusLabel(status: ServiceStatus) {
  if (status === "ok")    return "OK";
  if (status === "error") return "Fehler";
  return "Unbekannt";
}

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1)  return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `vor ${diffH} Std.`;
  return `vor ${Math.floor(diffH / 24)} Tagen`;
}

function ServiceCard({ entry }: { entry: HealthEntry }) {
  const label = SERVICE_LABELS[entry.serviceName] ?? entry.serviceName;
  return (
    <div className="bg-[var(--surface)] border border-[hsl(var(--border))] rounded-2xl p-6 shadow-[var(--card-shadow)] flat-card flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">{label}</h3>
        <span className={statusBadgeClass(entry.status)}>{statusLabel(entry.status)}</span>
      </div>

      <div className="flex items-center gap-2">
        <StatusIcon status={entry.status} />
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          Letzter Lauf: {entry.lastRunAt > 0 ? relativeTime(entry.lastRunAt) : "—"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-black text-[hsl(var(--muted-foreground))] uppercase tracking-[0.15em]">Verarbeitet</span>
          <span className="text-xl font-black text-[hsl(var(--foreground))]">{entry.itemsProcessed}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-black text-[hsl(var(--muted-foreground))] uppercase tracking-[0.15em]">Fehler</span>
          <span className={`text-xl font-black ${entry.itemsFailed > 0 ? "text-red-500" : "text-[hsl(var(--foreground))]"}`}>
            {entry.itemsFailed}
          </span>
        </div>
      </div>

      {entry.lastError && (
        <p className="text-[11px] text-red-500 bg-red-500/5 rounded-lg px-3 py-2 font-mono break-all leading-relaxed">
          {entry.lastError}
        </p>
      )}
    </div>
  );
}

function UnknownCard({ serviceName }: { serviceName: string }) {
  const phantom: HealthEntry = {
    serviceName,
    lastRunAt: 0,
    status: "unknown",
    itemsProcessed: 0,
    itemsFailed: 0,
    lastError: null,
    updatedAt: 0,
  };
  return <ServiceCard entry={phantom} />;
}

export function MonitoringPage() {
  const { data, isLoading, refetch, isFetching } = useMonitoringHealth();
  const byName = Object.fromEntries((data?.services ?? []).map((s) => [s.serviceName, s]));

  return (
    <div className="max-w-7xl mx-auto w-full flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Automatische Aktualisierung alle 30 Sekunden
        </p>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 h-9 px-4 rounded-lg border border-[hsl(var(--border))] text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[var(--hover-bg)] transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          Aktualisieren
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          {ALL_SERVICES.map((name) => (
            <div key={name} className="bg-[var(--surface)] border border-[hsl(var(--border))] rounded-2xl p-6 h-44 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          {ALL_SERVICES.map((name) =>
            byName[name]
              ? <ServiceCard key={name} entry={byName[name]} />
              : <UnknownCard key={name} serviceName={name} />
          )}
        </div>
      )}
    </div>
  );
}

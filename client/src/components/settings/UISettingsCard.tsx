import { useState, useEffect } from "react";
import { Layout, LayoutGrid, LayoutList, LayoutDashboard, Receipt, SplitSquareHorizontal, ArrowLeftRight, PlusCircle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/api/settings";
import { useToast } from "@/components/ui/use-toast";

export function UISettingsCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: uiSettings } = useQuery({
    queryKey: ["ui-settings"],
    queryFn: () => settingsApi.getUI(),
  });
  
  const [viewMode, setViewMode] = useState<"table" | "list">("list");
  const [startPage, setStartPage] = useState("/");
  const [uiSaving, setUISaving] = useState(false);

  useEffect(() => {
    if (uiSettings) {
      if (uiSettings.receiptsViewMode != null) setViewMode(uiSettings.receiptsViewMode);
      setStartPage(uiSettings.startPage);
    }
  }, [uiSettings]);

  async function saveUI(mode?: "table" | "list", page?: string) {
    setUISaving(true);
    const newMode = mode ?? viewMode;
    const newPage = page ?? startPage;
    if (mode) setViewMode(mode);
    if (page) setStartPage(page);
    try {
      await settingsApi.setUI(newMode, newPage);
      qc.invalidateQueries({ queryKey: ["ui-settings"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      toast({ title: "Anzeige-Einstellungen gespeichert" });
    } catch {
      toast({ title: "Speichern fehlgeschlagen", variant: "destructive" });
    } finally {
      setUISaving(false);
    }
  }

  return (
    <div className="flat-card p-6 space-y-4 h-full flex flex-col">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[var(--active-bg)] flex items-center justify-center flex-shrink-0">
          <Layout className="h-6 w-6 text-[hsl(var(--foreground))]" />
        </div>
        <div>
          <p className="text-foreground font-bold text-sm">Anzeige</p>
          <p className="text-muted-foreground text-xs font-medium">Standard-Ansicht für Belege</p>
        </div>
      </div>
      <div className="flex-grow space-y-4">
        <p className="text-muted-foreground text-xs leading-relaxed border-t border-border/40 pt-3">
          Wähle, wie Belege standardmäßig angezeigt werden sollen. Die Listenansicht ist besonders für mobile Geräte optimiert.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => saveUI("table")}
            disabled={uiSaving}
            className={`flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
              viewMode === "table"
                ? "border-primary bg-primary/5 text-primary"
                : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border"
            }`}
          >
            <div className={`p-2 rounded-xl ${viewMode === "table" ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
              <LayoutGrid className="h-5 w-5" />
            </div>
            <span className="text-xs font-bold">Tabelle</span>
          </button>
          <button
            onClick={() => saveUI("list")}
            disabled={uiSaving}
            className={`flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
              viewMode === "list"
                ? "border-primary bg-primary/5 text-primary"
                : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border"
            }`}
          >
            <div className={`p-2 rounded-xl ${viewMode === "list" ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
              <LayoutList className="h-5 w-5" />
            </div>
            <span className="text-xs font-bold">Liste (Mobil)</span>
          </button>
        </div>

        <div className="space-y-3 pt-4 border-t border-border/40">
          <p className="text-xs font-bold text-foreground">Startseite nach Login</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
              { path: "/upload", label: "Erfassen", icon: PlusCircle },
              { path: "/receipts", label: "Belege", icon: Receipt },
              { path: "/kontoabgleich", label: "Abgleich", icon: ArrowLeftRight },
              { path: "/splits", label: "Splits", icon: SplitSquareHorizontal },
            ].map((p) => {
              const isSelected = startPage === p.path || (p.path === "/dashboard" && startPage === "/");
              return (
                <button
                  key={p.path}
                  onClick={() => saveUI(undefined, p.path)}
                  disabled={uiSaving}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-left ${
                    isSelected
                      ? "border-primary bg-primary/5 text-primary font-bold"
                      : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border"
                  }`}
                >
                  <p.icon className="h-4 w-4" />
                  <span className="text-[10px] truncate">{p.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

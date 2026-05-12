import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/ui/use-toast";

export type ResetOptions = {
  localData: boolean;
  googleDrive: boolean;
};

export function useFactoryReset() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const execute = async (options: ResetOptions) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/factory-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
        credentials: "include",
      });

      const data = await res.json();

      if (res.ok || res.status === 207) {
        toast({
          title: "Factory Reset abgeschlossen",
          description:
            res.status === 207
              ? "Einige Operationen sind fehlgeschlagen. Siehe Details oben."
              : undefined,
          variant: res.ok ? "default" : "destructive",
        });

        if (res.ok) {
          setTimeout(() => navigate("/login"), 1500);
        }
      } else {
        toast({
          title: "Fehler beim Reset",
          description: data.message || "Unbekannter Fehler",
          variant: "destructive",
        });
      }

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      toast({
        title: "Fehler beim Reset",
        description: message,
        variant: "destructive",
      });
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { execute, loading };
}

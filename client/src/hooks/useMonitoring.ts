import { useQuery } from "@tanstack/react-query";
import { monitoringApi } from "@/api/monitoring";

export function useMonitoringHealth() {
  return useQuery({
    queryKey: ["monitoring-health"],
    queryFn: () => monitoringApi.getHealth(),
    refetchInterval: 30_000,
  });
}

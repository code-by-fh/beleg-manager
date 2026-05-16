import { api } from "./client";

export type ServiceStatus = "ok" | "error" | "unknown";

export type HealthEntry = {
  serviceName: string;
  lastRunAt: number;
  status: ServiceStatus;
  itemsProcessed: number;
  itemsFailed: number;
  lastError: string | null;
  updatedAt: number;
};

export type MonitoringHealth = {
  services: HealthEntry[];
};

export const monitoringApi = {
  getHealth: () => api.get<MonitoringHealth>("/api/monitoring/health"),
};

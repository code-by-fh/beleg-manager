import { api } from "./client";
import type { StatsSummary, MonthlyPoint, CategoryBucket } from "@/types/receipt";

export const statsApi = {
  summary: () => api.get<StatsSummary>("/api/stats/summary"),
  monthly: () => api.get<MonthlyPoint[]>("/api/stats/monthly"),
  categories: () => api.get<CategoryBucket[]>("/api/stats/categories"),
};

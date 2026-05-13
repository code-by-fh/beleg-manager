import { api } from "./client";
import type { StatsSummary, MonthlyPoint, CategoryBucket, TopMerchantBucket, PaymentMethodBucket } from "@/types/receipt";

export const statsApi = {
  summary: () => api.get<StatsSummary>("/api/stats/summary"),
  monthly: () => api.get<MonthlyPoint[]>("/api/stats/monthly"),
  categories: () => api.get<CategoryBucket[]>("/api/stats/categories"),
  topMerchants: () => api.get<TopMerchantBucket[]>("/api/stats/top-merchants"),
  paymentMethods: () => api.get<PaymentMethodBucket[]>("/api/stats/payment-methods"),
};

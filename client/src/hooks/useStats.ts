import { useQuery } from "@tanstack/react-query";
import { statsApi } from "@/api/stats";

export const useSummary = () => useQuery({ queryKey: ["stats", "summary"], queryFn: () => statsApi.summary() });
export const useMonthly = () => useQuery({ queryKey: ["stats", "monthly"], queryFn: () => statsApi.monthly() });
export const useCategories = () => useQuery({ queryKey: ["stats", "categories"], queryFn: () => statsApi.categories() });
export const useTopMerchants = () => useQuery({ queryKey: ["stats", "top-merchants"], queryFn: () => statsApi.topMerchants() });
export const usePaymentMethods = () => useQuery({ queryKey: ["stats", "payment-methods"], queryFn: () => statsApi.paymentMethods() });

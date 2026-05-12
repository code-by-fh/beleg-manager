import { useQuery } from "@tanstack/react-query";
import { receiptsApi } from "@/api/receipts";

export function useReceipts() {
  return useQuery({
    queryKey: ["receipts"],
    queryFn: () => receiptsApi.list(),
  });
}

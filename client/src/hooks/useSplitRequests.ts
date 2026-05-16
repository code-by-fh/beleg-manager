import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { splitRequestsApi } from "@/api/splitRequests";

export function useIncomingRequests() {
  return useQuery({
    queryKey: ["split-requests", "incoming"],
    queryFn: () => splitRequestsApi.incoming(),
    refetchInterval: 30_000,
  });
}

export function useOutgoingRequests() {
  return useQuery({
    queryKey: ["split-requests", "outgoing"],
    queryFn: () => splitRequestsApi.outgoing(),
    refetchInterval: 30_000,
  });
}

export function usePendingCount() {
  return useQuery({
    queryKey: ["split-requests", "pending-count"],
    queryFn: () => splitRequestsApi.pendingCount(),
    refetchInterval: 30_000,
    select: (data) => data.count,
  });
}

export function useUpdateRequestStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "accepted" | "rejected" | "cancelled" }) =>
      splitRequestsApi.updateStatus(id, status),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["split-requests"] });
    },
  });
}

export function useDeleteRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => splitRequestsApi.delete(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["split-requests"] });
    },
  });
}

export function useCreateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: splitRequestsApi.create,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["split-requests"] });
    },
  });
}

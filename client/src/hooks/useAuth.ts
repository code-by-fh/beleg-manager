import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi, type Me } from "@/api/auth";

export function useAuth() {
  const qc = useQueryClient();
  const query = useQuery<Me | null>({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await authApi.me();
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  return {
    user: query.data ?? null,
    isLoading: query.isLoading,
    isAuthenticated: !!query.data,
    logout: async () => {
      await authApi.logout();
      qc.setQueryData(["me"], null);
      qc.clear();
    },
  };
}

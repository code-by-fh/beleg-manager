import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { shareLinksApi } from "@/api/shareLinks";

export function useShareLinksList() {
  return useQuery({
    queryKey: ["share-links"],
    queryFn: () => shareLinksApi.list(),
  });
}

export function useCreateShareLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { personName: string; personEmail: string }) =>
      shareLinksApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["share-links"] });
    },
  });
}

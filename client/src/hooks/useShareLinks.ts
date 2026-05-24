import { useMutation } from "@tanstack/react-query";
import { shareLinksApi } from "@/api/shareLinks";

export function useCreateShareLink() {
  return useMutation({
    mutationFn: (payload: { personName: string; personEmail: string }) =>
      shareLinksApi.create(payload),
  });
}

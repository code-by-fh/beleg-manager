import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { receiptsApi } from "@/api/receipts";

export function useFailedVoiceJobs() {
  return useQuery({
    queryKey: ["failedVoiceJobs"],
    queryFn: () => receiptsApi.listFailedVoice(),
    refetchInterval: 30_000,
  });
}

export function useRetryVoiceJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => receiptsApi.retryVoice(jobId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["failedVoiceJobs"] });
      qc.invalidateQueries({ queryKey: ["receipts"] });
    },
  });
}

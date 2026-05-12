import { useQuery } from "@tanstack/react-query";
import { driveApi } from "@/api/drive";

export function useDriveInbox() {
  return useQuery({
    queryKey: ["drive", "inbox"],
    queryFn: () => driveApi.inbox(),
    refetchInterval: 30_000,
  });
}

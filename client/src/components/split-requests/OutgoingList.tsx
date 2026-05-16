import { useOutgoingRequests } from "@/hooks/useSplitRequests";
import { OutgoingRequestCard } from "./RequestCard";
import { Skeleton } from "@/components/ui/skeleton";

export function OutgoingList() {
  const { data, isLoading } = useOutgoingRequests();
  const requests = data?.requests ?? [];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="text-center py-12 text-[hsl(var(--muted-foreground))] text-sm">
        Keine ausgehenden Anforderungen
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {requests.map((r) => <OutgoingRequestCard key={r.id} request={r} />)}
    </div>
  );
}

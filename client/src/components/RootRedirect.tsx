import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";

export function RootRedirect() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="container py-8"><Skeleton className="h-32 w-full" /></div>;
  }

  const startPage = user?.startPage || "/dashboard";
  const targetPath = (startPage === "/" || startPage === "/dashboard") ? "/dashboard" : startPage;

  return <Navigate to={targetPath} replace />;
}

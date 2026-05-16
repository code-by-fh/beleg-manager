import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { usersApi } from "@/api/users";

export function useUserSearch() {
  const [inputValue, setInputValue] = useState("");
  const [debouncedValue, setDebouncedValue] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(inputValue), 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const query = useQuery({
    queryKey: ["user-search", debouncedValue],
    queryFn: () => usersApi.search(debouncedValue),
    enabled: debouncedValue.length >= 2,
  });

  return {
    inputValue,
    setInputValue,
    users: query.data?.users ?? [],
    isLoading: query.isFetching,
  };
}

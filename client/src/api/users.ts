import { api } from "./client";

export type UserSearchResult = { id: string; name: string; email: string };

export const usersApi = {
  search: (q: string) => api.get<{ users: UserSearchResult[] }>(`/api/users/search?q=${encodeURIComponent(q)}`),
};

import { api } from "./client";

export type Me = { id: string; email: string; name: string };

export const authApi = {
  me: () => api.get<Me>("/api/auth/me"),
  logout: () => api.post<{ ok: true }>("/api/auth/logout"),
  loginUrl: () => "/api/auth/google",
};

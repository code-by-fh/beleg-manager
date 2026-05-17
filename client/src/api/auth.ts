import { api } from "./client";

export type Me = {
  id: string;
  email: string;
  name: string;
  receiptsViewMode: "table" | "list" | null;
  startPage: string;
};

export const authApi = {
  me: () => api.get<Me>("/api/auth/me"),
  logout: () => api.post<{ ok: true }>("/api/auth/logout"),
  loginUrl: () => `${import.meta.env.VITE_API_URL ?? ""}/api/auth/google`,
};

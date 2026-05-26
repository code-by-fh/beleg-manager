import { api } from "./client";

export const settingsApi = {
  getGmail: () => api.get<{ enabled: boolean; labelFilter: string }>("/api/settings/gmail"),
  setGmail: (enabled: boolean, labelFilter: string) =>
    api.post<{ ok: true }>("/api/settings/gmail", { enabled, labelFilter }),

  getTelegram: () => api.get<{ configured: boolean }>("/api/settings/telegram"),
  setTelegramToken: (botToken: string | null) =>
    api.post<{ ok: true }>("/api/settings/telegram", { botToken }),

  getUI: () => api.get<{ receiptsViewMode: "table" | "list" | null; startPage: string }>("/api/settings/ui"),
  setUI: (receiptsViewMode: "table" | "list", startPage: string) =>
    api.post<{ ok: true }>("/api/settings/ui", { receiptsViewMode, startPage }),

  getCategories: () => api.get<{ categories: string[] }>("/api/settings/categories"),
  setCategories: (categories: string[]) =>
    api.post<{ ok: true }>("/api/settings/categories", { categories }),
};

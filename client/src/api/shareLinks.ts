import { api } from "./client";

export type ShareLinkInfo = {
  id: string;
  personName: string;
  personEmail: string;
  expiresAt: number;
};

export type PublicSplitRequestItem = {
  haendler: string;
  datum: string;
  betrag: number;
  waehrung: string;
  nachricht: string;
  status: string;
  driveFileUrl: string | null;
};

export type PublicShareData = {
  personName: string;
  requests: PublicSplitRequestItem[];
  expiresAt: number;
};

export const shareLinksApi = {
  create: (payload: { personName: string; personEmail: string }) =>
    api.post<{ shareUrl: string; expiresAt: number }>("/api/share-links", payload),

  list: () => api.get<{ links: ShareLinkInfo[] }>("/api/share-links"),

  delete: (id: string) => api.delete<{ ok: true }>(`/api/share-links/${id}`),

  getPublic: (token: string) =>
    api.get<PublicShareData>(`/api/share-links/${token}`),
};

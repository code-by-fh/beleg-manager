import { api } from "./client";

export type ShareLinkInfo = {
  id: string;
  personName: string;
  personEmail: string;
  expiresAt: number;
  token: string;
};

export type PublicSplitRequestItem = {
  id: string;
  haendler: string;
  datum: string;
  betrag: number;
  waehrung: string;
  nachricht: string;
  status: string;
  hasReceipt: boolean;
  positions?: Array<{ name: string; amount: number; assigned: string[]; quantity?: number }> | null;
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

  updateStatus: (token: string, requestId: string, status: "accepted" | "rejected") =>
    api.patch<{ ok: true }>(`/api/share-links/${token}/requests/${requestId}/status`, { status }),

  adjustSplit: (token: string, requestId: string, payload: { betrag: number; positions: any[] }) =>
    api.patch<{ ok: true }>(`/api/share-links/${token}/requests/${requestId}/adjust`, payload),

  receiptPreviewUrl: (token: string, requestId: string) =>
    `/api/share-links/${token}/requests/${requestId}/preview`,
};

import { api } from "./client";

export type SplitRequestStatus = "pending" | "accepted" | "rejected" | "cancelled";

export type ReceiptMeta = {
  haendler: string;
  datum: string;
  gesamtbetrag: number;
  waehrung: string;
};

export type UserInfo = { id: string; name: string; email: string };

export type SplitRequest = {
  id: string;
  fromUserId: string;
  toUserId: string | null;
  freeName: string | null;
  receiptId: string | null;
  receiptSqliteId: string | null;
  receiptMeta: ReceiptMeta;
  betrag: number;
  nachricht: string;
  status: SplitRequestStatus;
  createdAt: number;
  updatedAt: number;
  linkedBankTxId: string | null;
  linkedBankTxSource: "manual" | "receipt" | null;
};

export type IncomingRequest = SplitRequest & { fromUser: UserInfo | null };
export type OutgoingRequest = SplitRequest & { toUser: UserInfo | null };

export const splitRequestsApi = {
  incoming: () => api.get<{ requests: IncomingRequest[] }>("/api/split-requests/incoming"),

  outgoing: () => api.get<{ requests: OutgoingRequest[] }>("/api/split-requests/outgoing"),

  pendingCount: () => api.get<{ count: number }>("/api/split-requests/pending-count"),

  knownPersons: () => api.get<{ persons: string[] }>("/api/split-requests/known-persons"),

  create: (payload: {
    toUserId?: string;
    freeName?: string;
    receiptId?: string;
    receiptSqliteId?: string;
    receiptMeta: ReceiptMeta;
    betrag: number;
    nachricht: string;
  }) => api.post<{ request: SplitRequest }>("/api/split-requests", payload),

  updateStatus: (id: string, status: "pending" | "accepted" | "rejected" | "cancelled") =>
    api.patch<{ ok: true }>(`/api/split-requests/${id}/status`, { status }),

  linkBankTx: (id: string, bankTxId: string | null) =>
    api.patch<{ ok: true }>(`/api/split-requests/${id}/bank-tx`, { bankTxId }),

  delete: (id: string) => api.delete<{ ok: true }>(`/api/split-requests/${id}`),

  receiptPreviewUrl: (id: string) => `/api/split-requests/${id}/receipt-preview`,
};

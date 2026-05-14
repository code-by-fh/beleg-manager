import { api } from "./client";
import type { SplitRow } from "@/types/receipt";

export const splitsApi = {
  list: () => api.get<{ splits: SplitRow[] }>("/api/splits"),
  create: (payload: {
    receiptId: string;
    haendler: string;
    datum: string;
    gesamtbetrag: number;
    waehrung: string;
    items: Array<{ person: string; betrag: number }>;
  }) => api.post<{ ok: true; splits: SplitRow[] }>("/api/splits", payload),
  markSettled: (id: string, beglichen: boolean) =>
    api.patch<{ ok: true }>(`/api/splits/${id}/beglichen`, { beglichen }),
  linkBankTx: (id: string, bankTxId: string | null) =>
    api.patch<{ ok: true }>(`/api/splits/${id}/bank-tx`, { bankTxId }),
  delete: (id: string) => api.delete<{ ok: true }>(`/api/splits/${id}`),
};

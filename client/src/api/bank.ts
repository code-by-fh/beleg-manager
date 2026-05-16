import { api } from "./client";
import type { BankTransaction, ImportResult } from "@/types/bank";

export const bankApi = {
  importCsv: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.postForm<ImportResult>("/api/bank/import", fd);
  },

  listTransactions: (filter?: { from?: string; to?: string }) => {
    const params = new URLSearchParams();
    if (filter?.from) params.set("from", filter.from);
    if (filter?.to) params.set("to", filter.to);
    const qs = params.size > 0 ? `?${params.toString()}` : "";
    return api.get<{ transactions: BankTransaction[] }>(`/api/bank/transactions${qs}`);
  },

  matchTransaction: (transactionId: string, receiptId: string | null) =>
    api.post<{ ok: boolean }>("/api/bank/match", { transactionId, receiptId }),

  ignoreTransaction: (transactionId: string) =>
    api.post<{ ok: boolean }>("/api/bank/ignore", { transactionId }),

  autoMatch: () =>
    api.post<{ matched: number }>("/api/bank/auto-match"),

  autoMatchSplits: () =>
    api.post<{ matched: number }>("/api/bank/auto-match-splits"),

  deleteTransaction: (id: string) =>
    api.delete<{ ok: boolean }>(`/api/bank/transactions/${id}`),

  deleteRange: (from: string, to: string) => {
    const params = new URLSearchParams();
    params.set("from", from);
    params.set("to", to);
    return api.delete<{ ok: boolean; deleted: number }>(
      `/api/bank/transactions?${params.toString()}`
    );
  },
};

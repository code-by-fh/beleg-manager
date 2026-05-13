import { api } from "./client";
import type { BankTransaction, ImportResult } from "@/types/bank";

export const bankApi = {
  importCsv: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.postForm<ImportResult>("/api/bank/import", fd);
  },
  listTransactions: () =>
    api.get<{ transactions: BankTransaction[] }>("/api/bank/transactions"),
  matchTransaction: (transactionId: string, receiptId: string | null) =>
    api.post<{ ok: boolean }>("/api/bank/match", { transactionId, receiptId }),
  ignoreTransaction: (transactionId: string) =>
    api.post<{ ok: boolean }>("/api/bank/ignore", { transactionId }),
  clearTransactions: () =>
    api.delete<{ ok: boolean; deleted: number }>("/api/bank/transactions"),
};

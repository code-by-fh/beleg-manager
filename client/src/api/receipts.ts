import { api } from "./client";
import type { PendingReceiptResponse, ReceiptRow } from "@/types/receipt";

export const receiptsApi = {
  upload: (file: File, transcript?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    if (transcript) fd.append("transcript", transcript);
    return api.postForm<PendingReceiptResponse>("/api/receipts/upload", fd);
  },
  voice: (transcript: string) =>
    api.post<PendingReceiptResponse>("/api/receipts/voice", { transcript }),
  confirm: (payload: {
    pendingId: string;
    datum: string;
    haendler: string;
    betrag: number;
    mwst: number;
    trinkgeld: number;
    waehrung: string;
    kategorie: string;
    zahlungsmethode: string;
    rechnungsnummer: string;
  }) => api.post<{ ok: true; row: ReceiptRow }>("/api/receipts/confirm", payload),
  update: (id: string, payload: {
    datum: string;
    haendler: string;
    betrag: number;
    mwst: number;
    trinkgeld: number;
    waehrung: string;
    kategorie: string;
    zahlungsmethode: string;
    rechnungsnummer: string;
  }) => api.put<{ ok: true; row: ReceiptRow }>(`/api/receipts/${id}`, payload),
  getPending: (pendingId: string) =>
    api.get<{ pendingId: string; extraction: import("@/types/receipt").Extraction }>(`/api/receipts/pending/${pendingId}`),
  checkDuplicate: (haendler: string, betrag: number, datum: string) => {
    const params = new URLSearchParams({ haendler, betrag: String(betrag), datum });
    return api.get<{ duplicate: ReceiptRow | null }>(`/api/receipts/duplicate-check?${params}`);
  },
  list: () => api.get<{ rows: ReceiptRow[] }>("/api/receipts"),
  delete: (id: string) => api.delete<{ ok: true }>(`/api/receipts/${id}`),
};

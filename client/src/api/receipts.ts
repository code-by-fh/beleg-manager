import { api } from "./client";
import type { ReceiptRow } from "@/types/receipt";

export type VoiceResult =
  | { ok: true }
  | { ok: false; jobId: string };

export type FailedVoiceJob = {
  id: string;
  userId: string;
  transcript: string;
  error: string;
  createdAt: number;
};

export const receiptsApi = {
  upload: (file: File, transcript?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    if (transcript) fd.append("transcript", transcript);
    return api.postForm<{ ok: true }>("/api/receipts/upload", fd);
  },
  voice: (transcript: string) =>
    api.post<VoiceResult>("/api/receipts/voice", { transcript }),
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
    api.get<import("@/types/receipt").PendingReceiptResponse>(`/api/receipts/pending/${pendingId}`),
  checkDuplicate: (haendler: string, betrag: number, datum: string) => {
    const params = new URLSearchParams({ haendler, betrag: String(betrag), datum });
    return api.get<{ duplicate: ReceiptRow | null }>(`/api/receipts/duplicate-check?${params}`);
  },
  list: () => api.get<{ rows: ReceiptRow[] }>("/api/receipts"),
  delete: (id: string) => api.delete<{ ok: true }>(`/api/receipts/${id}`),
  deletePending: (id: string) => api.delete<{ ok: true }>(`/api/receipts/pending/${id}`),
  listFailedVoice: () =>
    api.get<{ jobs: FailedVoiceJob[] }>("/api/receipts/failed-voice"),
  retryVoice: (jobId: string) =>
    api.post<{ ok: true }>(`/api/receipts/retry-voice/${jobId}`, {}),
};

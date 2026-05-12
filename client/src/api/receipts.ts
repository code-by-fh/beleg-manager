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
    waehrung: string;
    kategorie: string;
    zahlungsmethode: string;
    rechnungsnummer: string;
  }) => api.post<{ ok: true; row: ReceiptRow }>("/api/receipts/confirm", payload),
  list: () => api.get<{ rows: ReceiptRow[] }>("/api/receipts"),
};

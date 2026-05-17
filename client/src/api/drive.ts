import { api } from "./client";
import type { DriveInboxFile, PendingReceiptResponse, ReceiptRow } from "@/types/receipt";
import type { ReceiptFormValues } from "@/lib/validators";

export const driveApi = {
  inbox: () => api.get<{ files: DriveInboxFile[] }>("/api/drive/inbox"),
  importFile: (fileId: string) => api.post<PendingReceiptResponse>(`/api/drive/import/${fileId}`),
  confirmManual: (fileId: string, values: ReceiptFormValues) =>
    api.post<{ ok: true; row: ReceiptRow }>(`/api/drive/inbox/${fileId}/confirm-manual`, values),
  reset: () => api.post<{ ok: boolean }>("/api/drive/reset"),
  deleteInboxFile: (fileId: string) => api.delete<{ ok: true }>(`/api/drive/inbox/${fileId}`),
};

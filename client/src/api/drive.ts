import { api } from "./client";
import type { DriveInboxFile, PendingReceiptResponse } from "@/types/receipt";

export const driveApi = {
  inbox: () => api.get<{ files: DriveInboxFile[] }>("/api/drive/inbox"),
  importFile: (fileId: string) => api.post<PendingReceiptResponse>(`/api/drive/import/${fileId}`),
};

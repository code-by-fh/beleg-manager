import type { DriveClient } from "../google/drive.js";
import { findOrCreateFolder, moveFile, getWebViewLink, uploadFile } from "../google/drive.js";

export function archivePathSegments(
  isoDate: string,
  nowFn: () => Date = () => new Date()
): { year: string; month: string } {
  const m = /^(\d{4})-(\d{1,2})-\d{1,2}$/.exec(isoDate ?? "");
  if (m) return { year: m[1]!, month: m[2]!.padStart(2, "0") };
  const d = nowFn();
  return { year: String(d.getUTCFullYear()), month: String(d.getUTCMonth() + 1).padStart(2, "0") };
}

export async function ensureArchiveSubfolder(
  drive: DriveClient,
  archiveRootId: string,
  isoDate: string
): Promise<string> {
  const { year, month } = archivePathSegments(isoDate);
  const yearId = await findOrCreateFolder(drive, year, archiveRootId);
  const monthId = await findOrCreateFolder(drive, month, yearId);
  return monthId;
}

export type ArchiveResult = { driveLink: string };

export async function archiveExistingFile(
  drive: DriveClient,
  fileId: string,
  archiveRootId: string,
  isoDate: string
): Promise<ArchiveResult> {
  const targetId = await ensureArchiveSubfolder(drive, archiveRootId, isoDate);
  await moveFile(drive, fileId, targetId);
  const driveLink = await getWebViewLink(drive, fileId);
  return { driveLink };
}

export async function archiveBuffer(
  drive: DriveClient,
  args: { name: string; mimeType: string; buffer: Buffer; archiveRootId: string; isoDate: string }
): Promise<ArchiveResult> {
  const targetId = await ensureArchiveSubfolder(drive, args.archiveRootId, args.isoDate);
  const created = await uploadFile(drive, {
    name: args.name,
    mimeType: args.mimeType,
    parentId: targetId,
    body: args.buffer,
  });
  return { driveLink: created.webViewLink };
}

import type { DriveClient } from "../google/drive.js";
import { findOrCreateFolder, moveFile, renameFile, getWebViewLink, uploadFile } from "../google/drive.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "archive" });

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

export function buildReceiptFileName(datum: string, haendler: string, kategorie: string, ext: string): string {
  const [year = "", month = "", day = ""] = datum.split("-");
  const yy = year.slice(-2);
  const sanitize = (s: string) =>
    s.toLowerCase().replace(/[äöüß]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" }[c] ?? c))
     .replace(/[^\w]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return `${yy}${month}${day}_${sanitize(haendler)}_${sanitize(kategorie)}.${ext}`;
}

export async function archiveExistingFile(
  drive: DriveClient,
  fileId: string,
  archiveRootId: string,
  isoDate: string,
  newName?: string
): Promise<ArchiveResult> {
  log.info({ fileId, isoDate, newName }, "archiving existing file");
  const targetId = await ensureArchiveSubfolder(drive, archiveRootId, isoDate);
  await moveFile(drive, fileId, targetId);
  if (newName) await renameFile(drive, fileId, newName);
  const driveLink = await getWebViewLink(drive, fileId);
  log.info({ fileId, driveLink }, "file archived");
  return { driveLink };
}

export async function archiveBuffer(
  drive: DriveClient,
  args: { name: string; mimeType: string; buffer: Buffer; archiveRootId: string; isoDate: string }
): Promise<ArchiveResult> {
  log.info({ fileName: args.name, isoDate: args.isoDate }, "archiving buffer");
  const targetId = await ensureArchiveSubfolder(drive, args.archiveRootId, args.isoDate);
  const created = await uploadFile(drive, {
    name: args.name,
    mimeType: args.mimeType,
    parentId: targetId,
    body: args.buffer,
  });
  log.info({ fileName: args.name, fileId: created.id }, "buffer archived");
  return { driveLink: created.webViewLink };
}

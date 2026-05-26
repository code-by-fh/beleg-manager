import { google, type drive_v3 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { Readable } from "node:stream";
import { logger } from "../logger.js";

const log = logger.child({ module: "drive" });

export type DriveClient = drive_v3.Drive;

export function driveFor(auth: OAuth2Client): DriveClient {
  return google.drive({ version: "v3", auth });
}

export async function findOrCreateFolder(
  drive: DriveClient,
  name: string,
  parentId?: string
): Promise<string> {
  const q = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(" and ");
  const list = await drive.files.list({ q, fields: "files(id,name)", pageSize: 1 });
  if (list.data.files && list.data.files[0]?.id) return list.data.files[0].id;

  log.info({ name, parentId }, "creating Drive folder");
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });
  if (!created.data.id) throw new Error("Drive folder creation returned no id");
  log.info({ folderId: created.data.id, name }, "Drive folder created");
  return created.data.id;
}

export async function listFolderFiles(
  drive: DriveClient,
  folderId: string
): Promise<Array<{ id: string; name: string; mimeType: string; appProperties?: Record<string, string> }>> {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
    fields: "files(id,name,mimeType,appProperties)",
    pageSize: 100,
  });
  const files = (res.data.files ?? []).map((f) => ({
    id: f.id!,
    name: f.name!,
    mimeType: f.mimeType ?? "application/octet-stream",
    appProperties: (f.appProperties as Record<string, string> | undefined) ?? undefined,
  }));
  log.debug({ folderId, count: files.length }, "listed folder files");
  return files;
}

export async function uploadFile(
  drive: DriveClient,
  args: { name: string; mimeType: string; parentId: string; body: Buffer }
): Promise<{ id: string; webViewLink: string }> {
  log.info({ fileName: args.name, mimeType: args.mimeType, sizeBytes: args.body.length }, "uploading file to Drive");
  const created = await drive.files.create({
    requestBody: { name: args.name, parents: [args.parentId] },
    media: { mimeType: args.mimeType, body: Readable.from(args.body) },
    fields: "id, webViewLink",
  });
  if (!created.data.id) throw new Error("Drive upload returned no id");
  log.info({ fileId: created.data.id, fileName: args.name }, "file uploaded to Drive");
  return { id: created.data.id, webViewLink: created.data.webViewLink ?? "" };
}

export async function moveFile(
  drive: DriveClient,
  fileId: string,
  targetParentId: string
): Promise<void> {
  log.debug({ fileId, targetParentId }, "moving file");
  const file = await drive.files.get({ fileId, fields: "parents" });
  const previousParents = (file.data.parents ?? []).join(",");
  await drive.files.update({
    fileId,
    addParents: targetParentId,
    removeParents: previousParents || undefined,
    fields: "id, parents",
  });
}

export async function setAppProperties(
  drive: DriveClient,
  fileId: string,
  appProperties: Record<string, string>
): Promise<void> {
  await drive.files.update({ fileId, requestBody: { appProperties } });
}

export async function renameFile(drive: DriveClient, fileId: string, newName: string): Promise<void> {
  await drive.files.update({ fileId, requestBody: { name: newName } });
}

export async function getWebViewLink(drive: DriveClient, fileId: string): Promise<string> {
  const res = await drive.files.get({ fileId, fields: "webViewLink" });
  return res.data.webViewLink ?? "";
}

export async function downloadFile(drive: DriveClient, fileId: string): Promise<Buffer> {
  log.debug({ fileId }, "downloading file from Drive");
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  const buf = Buffer.from(res.data as ArrayBuffer);
  log.debug({ fileId, sizeBytes: buf.length }, "file downloaded");
  return buf;
}

export async function listSubfolders(
  drive: DriveClient,
  folderId: string
): Promise<Array<{ id: string; name: string }>> {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
    fields: "files(id,name)",
    pageSize: 50,
    orderBy: "name",
  });
  return (res.data.files ?? []).map((f) => ({ id: f.id!, name: f.name! }));
}

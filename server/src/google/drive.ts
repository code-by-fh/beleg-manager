import { google, type drive_v3 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { Readable } from "node:stream";

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

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });
  if (!created.data.id) throw new Error("Drive folder creation returned no id");
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
  return (res.data.files ?? []).map((f) => ({
    id: f.id!,
    name: f.name!,
    mimeType: f.mimeType ?? "application/octet-stream",
    appProperties: (f.appProperties as Record<string, string> | undefined) ?? undefined,
  }));
}

export async function uploadFile(
  drive: DriveClient,
  args: { name: string; mimeType: string; parentId: string; body: Buffer }
): Promise<{ id: string; webViewLink: string }> {
  const created = await drive.files.create({
    requestBody: { name: args.name, parents: [args.parentId] },
    media: { mimeType: args.mimeType, body: Readable.from(args.body) },
    fields: "id, webViewLink",
  });
  if (!created.data.id) throw new Error("Drive upload returned no id");
  return { id: created.data.id, webViewLink: created.data.webViewLink ?? "" };
}

export async function moveFile(
  drive: DriveClient,
  fileId: string,
  targetParentId: string
): Promise<void> {
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

export async function getWebViewLink(drive: DriveClient, fileId: string): Promise<string> {
  const res = await drive.files.get({ fileId, fields: "webViewLink" });
  return res.data.webViewLink ?? "";
}

export async function downloadFile(drive: DriveClient, fileId: string): Promise<Buffer> {
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data as ArrayBuffer);
}

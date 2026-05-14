import type { OAuth2Client } from "google-auth-library";
import { driveFor, findOrCreateFolder } from "./drive.js";
import { sheetsFor, createSpreadsheet, moveSpreadsheetIntoFolder, spreadsheetExists } from "./sheets.js";
import type { UserRepo } from "../auth/userRepo.js";

const FINANZEN_FOLDER_NAME = "FINANZEN";
const ROOT_FOLDER_NAME = "Beleg-Manager";
const INBOX_FOLDER_NAME = "Belege_Eingang";
const ARCHIVE_FOLDER_NAME = "Archiv";
const SHEET_TITLE = "belege";

export async function bootstrapUserDrive(
  auth: OAuth2Client,
  userId: string,
  userRepo: UserRepo
): Promise<void> {
  const existing = userRepo.getById(userId);
  if (existing?.driveRootFolderId && existing.driveInboxFolderId && existing.driveArchiveFolderId && existing.sheetId) {
    return;
  }

  const drive = driveFor(auth);
  const sheets = sheetsFor(auth);

  const finanzienId = await findOrCreateFolder(drive, FINANZEN_FOLDER_NAME);
  const rootId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME, finanzienId);
  const inboxId = await findOrCreateFolder(drive, INBOX_FOLDER_NAME, rootId);
  const archiveId = await findOrCreateFolder(drive, ARCHIVE_FOLDER_NAME, rootId);

  let sheetId = existing?.sheetId ?? null;
  if (sheetId && !await spreadsheetExists(sheets, sheetId)) {
    sheetId = null;
  }
  if (!sheetId) {
    sheetId = await createSpreadsheet(sheets, SHEET_TITLE);
    await moveSpreadsheetIntoFolder(drive, sheetId, rootId);
  }

  userRepo.setDriveAssets(userId, {
    driveRootFolderId: rootId,
    driveInboxFolderId: inboxId,
    driveArchiveFolderId: archiveId,
    sheetId,
  });
}

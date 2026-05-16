import cron from "node-cron";
import { randomUUID } from "node:crypto";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { GeminiClient } from "../gemini/extract.js";
import { buildOAuth2ClientForRefreshToken } from "../google/client.js";
import { driveFor, listFolderFiles, downloadFile, setAppProperties } from "../google/drive.js";
import { sheetsFor, appendRow, type ReceiptRow } from "../google/sheets.js";
import { archiveExistingFile } from "../receipts/archive.js";
import { SUPPORTED_MIME_TYPES, SOURCE_KIND_TO_EINGABE_TYP } from "../receipts/types.js";

export type PollerDeps = {
  config: Config;
  userRepo: UserRepo;
  gemini: GeminiClient;
};

export function startInboxPoller(deps: PollerDeps): { stop: () => void } {
  const task = cron.schedule("*/5 * * * *", () => {
    runOnce(deps).catch((err) => console.error("[inbox-poller]", err));
  });
  return { stop: () => task.stop() };
}

export async function runOnce(deps: PollerDeps): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;
  const users = deps.userRepo.listAllWithRefreshToken();
  for (const user of users) {
    if (!user.refreshToken || !user.driveInboxFolderId) continue;
    try {
      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      const drive = driveFor(auth);
      const sheets = sheetsFor(auth);
      const files = await listFolderFiles(drive, user.driveInboxFolderId);
      for (const file of files) {
        if (file.appProperties?.bm_status) continue;
        if (!SUPPORTED_MIME_TYPES.has(file.mimeType)) continue;
        try {
          const buffer = await downloadFile(drive, file.id);
          const extraction = await deps.gemini.extractFromPhoto({ mimeType: file.mimeType, buffer });

          const datum = extraction.datum ?? new Date().toISOString().slice(0, 10);

          let driveLink = "";
          if (user.driveArchiveFolderId) {
            try {
              const r = await archiveExistingFile(drive, file.id, user.driveArchiveFolderId, datum);
              driveLink = r.driveLink;
            } catch (archErr) {
              console.error("[inbox-poller] archive failed, continuing without link:", archErr);
            }
          }

          if (user.sheetId) {
            const row: ReceiptRow = {
              id: randomUUID(),
              datum,
              haendler: extraction.haendler ?? "Unbekannt",
              betrag: extraction.betrag ?? 0,
              mwst: extraction.mwst ?? 0,
              trinkgeld: extraction.trinkgeld ?? 0,
              waehrung: extraction.waehrung ?? "EUR",
              kategorie: extraction.kategorie ?? "Sonstiges",
              zahlungsmethode: extraction.zahlungsmethode ?? "Unbekannt",
              rechnungsnummer: extraction.rechnungsnummer ?? "",
              driveLink,
              eingabeTyp: SOURCE_KIND_TO_EINGABE_TYP["drive"],
              erstelltAm: new Date().toISOString(),
            };
            await appendRow(sheets, user.sheetId, row);
          }

          await setAppProperties(drive, file.id, { bm_status: "confirmed" }).catch(() => undefined);
          processed++;
        } catch (err) {
          await setAppProperties(drive, file.id, {
            bm_status: "failed",
            bm_error: String((err as Error).message ?? err).slice(0, 200),
          }).catch(() => undefined);
          failed++;
        }
      }
    } catch (err) {
      console.error(`[inbox-poller] user ${user.id}:`, err);
    }
  }
  return { processed, failed };
}

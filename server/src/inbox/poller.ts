import cron from "node-cron";
import { randomUUID } from "node:crypto";
import { logger } from "../logger.js";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { GeminiClient } from "../gemini/extract.js";
import type { HealthRepo } from "../monitoring/repo.js";
import type { ReceiptRepo } from "../receipts/receiptRepo.js";
import { buildOAuth2ClientForRefreshToken } from "../google/client.js";
import { driveFor, listFolderFiles, downloadFile, setAppProperties } from "../google/drive.js";
import { archiveExistingFile } from "../receipts/archive.js";
import { SUPPORTED_MIME_TYPES, SOURCE_KIND_TO_EINGABE_TYP } from "../receipts/types.js";
import { cleanErrorMessage } from "../gemini/errors.js";

export type PollerDeps = {
  config: Config;
  userRepo: UserRepo;
  gemini: GeminiClient;
  healthRepo?: HealthRepo;
  receiptRepo: ReceiptRepo;
};

const log = logger.child({ module: "inbox-poller" });

export function startInboxPoller(deps: PollerDeps): { stop: () => void } {
  log.info("inbox poller started");
  const task = cron.schedule("*/5 * * * * *", () => {
    runOnce(deps)
      .then(({ processed, failed }) => {
        deps.healthRepo?.upsert({
          serviceName: "drive-inbox-poller",
          lastRunAt: Date.now(),
          status: failed > 0 && processed === 0 ? "error" : "ok",
          itemsProcessed: processed,
          itemsFailed: failed,
          lastError: null,
        });
      })
      .catch((err) => {
        log.error({ err }, "poll run failed");
        deps.healthRepo?.upsert({
          serviceName: "drive-inbox-poller",
          lastRunAt: Date.now(),
          status: "error",
          itemsProcessed: 0,
          itemsFailed: 0,
          lastError: String((err as Error).message ?? err).slice(0, 500),
        });
      });
  });
  return {
    stop: () => {
      log.info("inbox poller stopped");
      task.stop();
    },
  };
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
      const files = await listFolderFiles(drive, user.driveInboxFolderId);
      for (const file of files) {
        if (file.appProperties?.bm_status) continue;
        if (!SUPPORTED_MIME_TYPES.has(file.mimeType)) continue;
        try {
          const buffer = await downloadFile(drive, file.id);
          const extraction = await deps.gemini.extractFromPhoto({ mimeType: file.mimeType, buffer });

          const datum = extraction.datum ?? new Date().toISOString().slice(0, 10);
          const haendler = extraction.haendler ?? "Unbekannt";
          const betrag = extraction.betrag ?? 0;

          const isDuplicate = deps.receiptRepo.checkDuplicate(user.id, datum, haendler, betrag);
          if (isDuplicate) {
            throw new Error("Duplikat erkannt: Beleg existiert bereits");
          }

          let driveLink = "";
          if (user.driveArchiveFolderId) {
            try {
              const r = await archiveExistingFile(drive, file.id, user.driveArchiveFolderId, datum);
              driveLink = r.driveLink;
            } catch (archErr) {
              log.warn({ err: archErr, fileId: file.id }, "archive failed, continuing without link");
            }
          }

          deps.receiptRepo.insert(user.id, {
            id: randomUUID(),
            datum,
            haendler,
            betrag,
            mwst: extraction.mwst ?? 0,
            trinkgeld: extraction.trinkgeld ?? 0,
            waehrung: extraction.waehrung ?? "EUR",
            kategorie: extraction.kategorie ?? "Sonstiges",
            zahlungsmethode: extraction.zahlungsmethode ?? "Unbekannt",
            rechnungsnummer: extraction.rechnungsnummer ?? "",
            driveLink,
            eingabeTyp: SOURCE_KIND_TO_EINGABE_TYP["drive"],
            erstelltAm: new Date().toISOString(),
          });

          await setAppProperties(drive, file.id, { bm_status: "confirmed" }).catch(() => undefined);
          log.debug({ fileId: file.id, userId: user.id }, "file processed");
          processed++;
        } catch (err) {
          log.error({ err, fileId: file.id, userId: user.id }, "file processing failed");
          await setAppProperties(drive, file.id, {
            bm_status: "failed",
            bm_error: cleanErrorMessage(err),
          }).catch(() => undefined);
          failed++;
        }
      }
    } catch (err) {
      log.error({ err, userId: user.id }, "user poll failed");
    }
  }
  log.info({ processed, failed }, "run complete");
  return { processed, failed };
}

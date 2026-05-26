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
import { archiveExistingFile, buildReceiptFileName } from "../receipts/archive.js";
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
  let running = false;
  const task = cron.schedule("*/5 * * * * *", () => {
    if (running) return;
    running = true;
    runOnce(deps)
      .then(({ processed, failed }) => {
        running = false;
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
        running = false;
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
      const newFiles = files.filter((f) => !f.appProperties?.bm_status);
      if (newFiles.length > 0) {
        log.info({ userId: user.id, count: newFiles.length }, "found unprocessed inbox files");
      }
      for (const file of files) {
        if (file.appProperties?.bm_status) continue;
        if (!SUPPORTED_MIME_TYPES.has(file.mimeType)) {
          log.debug({ fileId: file.id, mimeType: file.mimeType, userId: user.id }, "skipping unsupported mime type");
          continue;
        }
        try {
          const buffer = await downloadFile(drive, file.id);
          const customCats: string[] = JSON.parse(user.customCategories || "[]");
          const extraction = await deps.gemini.extractFromPhoto({ mimeType: file.mimeType, buffer }, undefined, customCats);

          const datum = extraction.datum ?? new Date().toISOString().slice(0, 10);
          const haendler = extraction.haendler ?? "Unbekannt";
          const betrag = extraction.betrag ?? 0;

          const isDuplicate = deps.receiptRepo.checkDuplicate(user.id, datum, haendler, betrag);
          if (isDuplicate) {
            log.info({ fileId: file.id, userId: user.id, datum, haendler, betrag }, "duplicate detected, skipping");
            throw new Error("Duplikat erkannt: Beleg existiert bereits");
          }

          const kategorie = extraction.kategorie ?? "Sonstiges";
          let driveLink = "";
          if (user.driveArchiveFolderId) {
            try {
              const ext = file.mimeType === "application/pdf" ? "pdf" : file.mimeType.split("/")[1] ?? "bin";
              const r = await archiveExistingFile(
                drive, file.id, user.driveArchiveFolderId, datum,
                buildReceiptFileName(datum, haendler, kategorie, ext)
              );
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
            kategorie,
            zahlungsmethode: extraction.zahlungsmethode ?? "Unbekannt",
            rechnungsnummer: extraction.rechnungsnummer ?? "",
            driveLink,
            eingabeTyp: SOURCE_KIND_TO_EINGABE_TYP["drive"],
            erstelltAm: new Date().toISOString(),
            positions: extraction.positions ?? null,
          });

          await setAppProperties(drive, file.id, { bm_status: "confirmed" }).catch(() => undefined);
          log.info({ fileId: file.id, userId: user.id, haendler, betrag, datum }, "receipt extracted and archived");
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

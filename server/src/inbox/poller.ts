import cron from "node-cron";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { GeminiClient } from "../gemini/extract.js";
import { buildOAuth2ClientForRefreshToken } from "../google/client.js";
import { driveFor, listFolderFiles, downloadFile, setAppProperties } from "../google/drive.js";
import { SUPPORTED_MIME_TYPES } from "../receipts/types.js";

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
      const files = await listFolderFiles(drive, user.driveInboxFolderId);
      for (const file of files) {
        if (file.appProperties?.bm_status) continue; // already processed or failed
        if (!SUPPORTED_MIME_TYPES.has(file.mimeType)) continue;
        try {
          const buffer = await downloadFile(drive, file.id);
          const extraction = await deps.gemini.extractFromPhoto({ mimeType: file.mimeType, buffer });
          await setAppProperties(drive, file.id, {
            bm_status: "pending_review",
            bm_extracted_json: JSON.stringify(extraction),
          });
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

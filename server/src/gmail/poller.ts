import cron from "node-cron";
import { google } from "googleapis";
import { logger } from "../logger.js";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { Db } from "../db/index.js";
import { buildOAuth2ClientForRefreshToken } from "../google/client.js";
import { uploadFile, driveFor } from "../google/drive.js";
import { SUPPORTED_MIME_TYPES } from "../receipts/types.js";

export type GmailPollerDeps = {
  config: Config;
  userRepo: UserRepo;
  db: Db;
};

const log = logger.child({ module: "gmail-poller" });

export function startGmailPoller(deps: GmailPollerDeps): { stop: () => void } {
  const isProcessedStmt = deps.db.prepare<[string], { 1: number }>(
    "SELECT 1 FROM gmail_processed_messages WHERE message_id = ?"
  );
  const markProcessedStmt = deps.db.prepare<[string, string, number]>(
    "INSERT OR IGNORE INTO gmail_processed_messages (message_id, user_id, processed_at) VALUES (?, ?, ?)"
  );

  const checkProcessed = (id: string) => !!isProcessedStmt.get(id);
  const markProcessed = (id: string, userId: string, ts: number) => markProcessedStmt.run(id, userId, ts);

  log.info("gmail poller started");
  const task = cron.schedule("*/5 * * * *", () => {
    runOnce(deps, checkProcessed, markProcessed).catch((err) => log.error({ err }, "poll run failed"));
  });
  return {
    stop: () => {
      log.info("gmail poller stopped");
      task.stop();
    },
  };
}

export async function runOnce(
  deps: GmailPollerDeps,
  checkProcessed: (id: string) => boolean,
  markProcessed: (id: string, userId: string, ts: number) => void,
): Promise<{ processed: number; failed: number }> {

  let processed = 0;
  let failed = 0;

  const users = deps.userRepo.listAllWithRefreshToken();
  for (const user of users) {
    if (!user.refreshToken || !user.gmailPollingEnabled || !user.driveInboxFolderId) continue;
    try {
      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      const gmail = google.gmail({ version: "v1", auth });
      const drive = driveFor(auth);

      const qParts = ["has:attachment"];
      if (user.gmailLabelFilter) qParts.push(`label:${user.gmailLabelFilter}`);
      const q = qParts.join(" ");

      const listRes = await gmail.users.messages.list({ userId: "me", q, maxResults: 20 });
      const messages = listRes.data.messages ?? [];

      for (const msg of messages) {
        if (!msg.id) continue;
        if (checkProcessed(msg.id)) continue;

        try {
          const full = await gmail.users.messages.get({ userId: "me", id: msg.id, format: "full" });
          const parts = flattenParts(full.data.payload?.parts ?? []);

          for (const part of parts) {
            if (!part.body?.attachmentId) continue;
            const mimeType = part.mimeType ?? "";
            if (!SUPPORTED_MIME_TYPES.has(mimeType)) continue;

            const attachRes = await gmail.users.messages.attachments.get({
              userId: "me",
              messageId: msg.id,
              id: part.body.attachmentId,
            });

            const data = attachRes.data.data;
            if (!data) continue;

            const buffer = Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
            const ext = mimeType.split("/")[1] ?? "bin";
            const filename = part.filename || `gmail-beleg.${ext}`;

            await uploadFile(drive, {
              name: filename,
              mimeType,
              parentId: user.driveInboxFolderId!,
              body: buffer,
            });

            processed++;
          }

          markProcessed(msg.id, user.id, Date.now());
        } catch (err) {
          log.error({ err, messageId: msg.id, userId: user.id }, "message processing failed");
          markProcessed(msg.id, user.id, Date.now());
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

function flattenParts(
  parts: Array<{ mimeType?: string | null; body?: { attachmentId?: string | null } | null; parts?: unknown[] | null; filename?: string | null }>
): Array<{ mimeType?: string | null; body?: { attachmentId?: string | null } | null; filename?: string | null }> {
  const result: typeof parts = [];
  for (const p of parts) {
    result.push(p);
    if (p.parts) result.push(...flattenParts(p.parts as typeof parts));
  }
  return result;
}

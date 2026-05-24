import { google } from "googleapis";
import { buildOAuth2ClientForRefreshToken, type GoogleCfg } from "../google/client.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "share-links-service" });

export async function shareReceiptsWithEmail(
  cfg: GoogleCfg,
  refreshToken: string,
  receiptIds: string[],
  personEmail: string,
): Promise<void> {
  const auth = buildOAuth2ClientForRefreshToken(cfg, refreshToken);
  const drive = google.drive({ version: "v3", auth });

  for (const fileId of receiptIds) {
    try {
      await drive.permissions.create({
        fileId,
        requestBody: { role: "reader", type: "user", emailAddress: personEmail },
        sendNotificationEmail: false,
      });
    } catch (err) {
      log.warn({ err, fileId, personEmail }, "drive share permission failed (non-fatal)");
    }
  }
}

function buildMimeMessage(opts: {
  from: string;
  to: string;
  ownerName: string;
  personName: string;
  shareUrl: string;
  expiresAt: number;
}): string {
  const expiryDate = new Date(opts.expiresAt).toLocaleDateString("de-DE", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const body = [
    `Hallo ${opts.personName},`,
    ``,
    `${opts.ownerName} hat dir eine Übersicht deiner offenen Anforderungen geteilt.`,
    ``,
    `Hier kannst du alle Details einsehen:`,
    opts.shareUrl,
    ``,
    `Der Link ist gültig bis: ${expiryDate}`,
    ``,
    `Falls Belege angehängt sind, sind diese für deine Google-Adresse (${opts.to}) freigegeben.`,
  ].join("\n");

  const raw = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: Deine Anforderungen von ${opts.ownerName}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    body,
  ].join("\r\n");

  return Buffer.from(raw).toString("base64url");
}

export async function sendShareLinkEmail(
  cfg: GoogleCfg,
  refreshToken: string,
  opts: {
    ownerEmail: string;
    ownerName: string;
    personName: string;
    personEmail: string;
    shareUrl: string;
    expiresAt: number;
  },
): Promise<void> {
  const auth = buildOAuth2ClientForRefreshToken(cfg, refreshToken);
  const gmail = google.gmail({ version: "v1", auth });

  const raw = buildMimeMessage({
    from: opts.ownerEmail,
    to: opts.personEmail,
    ownerName: opts.ownerName,
    personName: opts.personName,
    shareUrl: opts.shareUrl,
    expiresAt: opts.expiresAt,
  });

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
}

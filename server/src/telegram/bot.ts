import { Router } from "express";
import { randomUUID } from "node:crypto";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { GeminiClient } from "../gemini/extract.js";
import { buildOAuth2ClientForRefreshToken } from "../google/client.js";
import { driveFor } from "../google/drive.js";
import { sheetsFor, appendRow, type ReceiptRow } from "../google/sheets.js";
import { archiveBuffer } from "../receipts/archive.js";
import { SUPPORTED_MIME_TYPES, SOURCE_KIND_TO_EINGABE_TYP } from "../receipts/types.js";

const TELEGRAM_API = "https://api.telegram.org";

async function telegramPost<T>(token: string, method: string, body: object): Promise<T> {
  const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description ?? "unknown error"}`);
  return data.result;
}

async function downloadTelegramFile(token: string, fileId: string): Promise<{ buffer: Buffer; filePath: string }> {
  type FileResult = { file_path: string };
  const file = await telegramPost<FileResult>(token, "getFile", { file_id: fileId });
  const res = await fetch(`${TELEGRAM_API}/file/bot${token}/${file.file_path}`);
  if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, filePath: file.file_path };
}

export async function registerWebhook(token: string, webhookUrl: string): Promise<void> {
  await telegramPost(token, "setWebhook", { url: webhookUrl, allowed_updates: ["message"] });
}

export async function validateBotToken(token: string): Promise<{ id: number; username: string }> {
  type MeResult = { id: number; username: string };
  return telegramPost<MeResult>(token, "getMe", {});
}

type TelegramPhotoSize = { file_id: string; width: number; height: number; file_size?: number };
type TelegramMessage = {
  chat: { id: number };
  photo?: TelegramPhotoSize[];
  document?: { file_id: string; mime_type?: string; file_name?: string };
};
type TelegramUpdate = { message?: TelegramMessage };

export type TelegramBotDeps = {
  config: Config;
  userRepo: UserRepo;
  gemini: GeminiClient;
};

export function buildTelegramRouter(deps: TelegramBotDeps) {
  const router = Router();

  router.post("/webhook/:userId", async (req, res) => {
    res.sendStatus(200); // always ack immediately

    const { userId } = req.params;
    const user = deps.userRepo.getById(userId);
    if (!user?.telegramBotToken) return;

    const update: TelegramUpdate = req.body;
    const message = update.message;
    if (!message) return;

    const chatId = message.chat.id;

    try {
      let buffer: Buffer | null = null;
      let mimeType = "image/jpeg";
      let originalName = `beleg_${Date.now()}.jpg`;

      if (message.photo && message.photo.length > 0) {
        const largest = message.photo.reduce((a, b) => (a.file_size ?? 0) > (b.file_size ?? 0) ? a : b);
        const dl = await downloadTelegramFile(user.telegramBotToken, largest.file_id);
        buffer = dl.buffer;
      } else if (message.document?.mime_type && SUPPORTED_MIME_TYPES.has(message.document.mime_type)) {
        const dl = await downloadTelegramFile(user.telegramBotToken, message.document.file_id);
        buffer = dl.buffer;
        mimeType = message.document.mime_type;
        originalName = message.document.file_name ?? originalName;
      }

      if (!buffer) {
        await telegramPost(user.telegramBotToken, "sendMessage", {
          chat_id: chatId,
          text: "Bitte schicke ein Foto oder PDF eines Belegs.",
        });
        return;
      }

      const extraction = await deps.gemini.extractFromPhoto({ mimeType, buffer });

      const datum = extraction.datum ?? new Date().toISOString().slice(0, 10);
      const haendler = extraction.haendler ?? "Unbekannt";
      const betrag = extraction.betrag != null ? `${extraction.betrag} ${extraction.waehrung ?? "EUR"}` : "?";

      let driveLink = "";
      if (user.refreshToken && user.driveArchiveFolderId) {
        try {
          const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
          const drive = driveFor(auth);
          const ext = mimeType === "application/pdf" ? "pdf" : mimeType.split("/")[1] ?? "bin";
          const archiveName = `${datum}_${haendler}`.replace(/[^\w.-]/g, "_") + `.${ext}`;
          const r = await archiveBuffer(drive, {
            name: archiveName,
            mimeType,
            buffer,
            archiveRootId: user.driveArchiveFolderId,
            isoDate: datum,
          });
          driveLink = r.driveLink;
        } catch (archErr) {
          console.error("[telegram-bot] archive failed:", archErr);
        }
      }

      if (user.refreshToken && user.sheetId) {
        const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
        const sheets = sheetsFor(auth);
        const row: ReceiptRow = {
          id: randomUUID(),
          datum,
          haendler,
          betrag: extraction.betrag ?? 0,
          mwst: extraction.mwst ?? 0,
          trinkgeld: extraction.trinkgeld ?? 0,
          waehrung: extraction.waehrung ?? "EUR",
          kategorie: extraction.kategorie ?? "Sonstiges",
          zahlungsmethode: extraction.zahlungsmethode ?? "Unbekannt",
          rechnungsnummer: extraction.rechnungsnummer ?? "",
          driveLink,
          eingabeTyp: SOURCE_KIND_TO_EINGABE_TYP["telegram"],
          erstelltAm: new Date().toISOString(),
        };
        await appendRow(sheets, user.sheetId, row);
      }

      await telegramPost(user.telegramBotToken, "sendMessage", {
        chat_id: chatId,
        text: `✓ Beleg gespeichert: *${haendler}* · ${betrag}`,
        parse_mode: "Markdown",
      });
    } catch (err) {
      console.error("[telegram-bot]", err);
      await telegramPost(user.telegramBotToken, "sendMessage", {
        chat_id: chatId,
        text: "Fehler beim Verarbeiten des Belegs. Bitte erneut versuchen.",
      }).catch(() => {});
    }
  });

  return router;
}

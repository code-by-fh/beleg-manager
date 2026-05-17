import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { Config } from "../config.js";
import { validateBotToken, registerWebhook } from "../telegram/bot.js";

const GmailSettingsBody = z.object({
  enabled: z.boolean(),
  labelFilter: z.string().max(100).default(""),
});

const TelegramSettingsBody = z.object({
  botToken: z.string().max(200).nullable(),
});

const UISettingsBody = z.object({
  receiptsViewMode: z.enum(["table", "list"]),
  startPage: z.string().startsWith("/"),
});

export function buildSettingsRouter(userRepo: UserRepo, config?: Config) {
  const router = Router();
  router.use(requireAuth);

  router.get("/gmail", (req, res) => {
    const user = userRepo.getById(req.session.userId!);
    res.json({
      enabled: user?.gmailPollingEnabled ?? false,
      labelFilter: user?.gmailLabelFilter ?? "",
    });
  });

  router.post("/gmail", (req, res) => {
    const parsed = GmailSettingsBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid body" });
    userRepo.setGmailSettings(req.session.userId!, parsed.data.enabled, parsed.data.labelFilter);
    res.json({ ok: true });
  });

  router.get("/telegram", (req, res) => {
    const user = userRepo.getById(req.session.userId!);
    res.json({ configured: !!user?.telegramBotToken });
  });

  router.post("/telegram", async (req, res) => {
    const parsed = TelegramSettingsBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid body" });

    const userId = req.session.userId!;
    const { botToken } = parsed.data;

    if (botToken) {
      try {
        await validateBotToken(botToken);
      } catch {
        return res.status(400).json({ error: "Ungültiger Bot-Token" });
      }
      if (config) {
        const webhookUrl = `${config.appPublicUrl}/api/telegram/webhook/${userId}`;
        await registerWebhook(botToken, webhookUrl).catch((err) =>
          console.warn("[settings] webhook registration failed:", err)
        );
      }
    }

    userRepo.setTelegramBotToken(userId, botToken);
    res.json({ ok: true });
  });
  
  router.get("/ui", (req, res) => {
    const user = userRepo.getById(req.session.userId!);
    res.json({
      receiptsViewMode: user?.receiptsViewMode ?? null,
      startPage: user?.startPage ?? "/",
    });
  });

  router.post("/ui", (req, res) => {
    const parsed = UISettingsBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid body" });
    userRepo.setUISettings(req.session.userId!, parsed.data);
    res.json({ ok: true });
  });

  return router;
}

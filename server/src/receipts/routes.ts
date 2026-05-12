import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { GeminiClient } from "../gemini/extract.js";
import type { PendingStore } from "./pendingStore.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { uploadSingleImage } from "../middleware/upload.js";
import { uploadRateLimit } from "../middleware/rateLimit.js";
import { buildOAuth2ClientFromSession } from "../google/client.js";
import { driveFor } from "../google/drive.js";
import { sheetsFor, appendRow, readAllRows, type ReceiptRow } from "../google/sheets.js";
import { archiveExistingFile, archiveBuffer } from "./archive.js";

const VoiceBody = z.object({ transcript: z.string().min(1).max(4000) });

const ConfirmBody = z.object({
  pendingId: z.string().min(1),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  haendler: z.string().min(1),
  betrag: z.number().nonnegative(),
  mwst: z.number().nonnegative(),
  waehrung: z.string().min(1),
  kategorie: z.string().min(1),
  zahlungsmethode: z.string().min(1),
  rechnungsnummer: z.string().default(""),
});

export type ReceiptsDeps = {
  config: Config;
  userRepo: UserRepo;
  gemini: GeminiClient;
  pending: PendingStore;
};

export function buildReceiptsRouter(deps: ReceiptsDeps) {
  const router = Router();
  router.use(requireAuth);

  router.post("/upload", uploadRateLimit, uploadSingleImage, async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "file required" });
      const transcript = typeof req.body?.transcript === "string" ? req.body.transcript : undefined;
      const extraction = await deps.gemini.extractFromPhoto(
        { mimeType: req.file.mimetype, buffer: req.file.buffer },
        transcript
      );
      const pendingId = deps.pending.put({
        userId: req.session.userId!,
        source: { kind: "upload", mimeType: req.file.mimetype, buffer: req.file.buffer },
        extraction,
      });
      res.json({ pendingId, extraction, fileName: req.file.originalname });
    } catch (err) {
      next(err);
    }
  });

  router.post("/voice", uploadRateLimit, async (req, res, next) => {
    try {
      const parsed = VoiceBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
      const extraction = await deps.gemini.extractFromTranscript(parsed.data.transcript);
      const pendingId = deps.pending.put({
        userId: req.session.userId!,
        source: { kind: "voice" },
        extraction,
      });
      res.json({ pendingId, extraction });
    } catch (err) {
      next(err);
    }
  });

  router.post("/confirm", async (req, res, next) => {
    try {
      const parsed = ConfirmBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });
      const userId = req.session.userId!;
      const pending = deps.pending.take(userId, parsed.data.pendingId);
      if (!pending) return res.status(404).json({ error: "pending receipt not found or expired" });

      const user = deps.userRepo.getById(userId);
      if (!user?.driveArchiveFolderId || !user.sheetId) {
        return res.status(409).json({ error: "user drive not bootstrapped" });
      }

      const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
      const drive = driveFor(auth);
      const sheets = sheetsFor(auth);

      let driveLink = "";
      const baseName = `${parsed.data.datum}_${parsed.data.haendler}`.replace(/[^\w.-]/g, "_");
      if (pending.source.kind === "upload") {
        const ext = pending.source.mimeType === "application/pdf" ? "pdf" : pending.source.mimeType.split("/")[1] ?? "bin";
        const r = await archiveBuffer(drive, {
          name: `${baseName}.${ext}`,
          mimeType: pending.source.mimeType,
          buffer: pending.source.buffer,
          archiveRootId: user.driveArchiveFolderId,
          isoDate: parsed.data.datum,
        });
        driveLink = r.driveLink;
      } else if (pending.source.kind === "drive") {
        const r = await archiveExistingFile(drive, pending.source.fileId, user.driveArchiveFolderId, parsed.data.datum);
        driveLink = r.driveLink;
      }
      // voice: no file to archive

      const row: ReceiptRow = {
        id: uuidv4(),
        datum: parsed.data.datum,
        haendler: parsed.data.haendler,
        betrag: parsed.data.betrag,
        mwst: parsed.data.mwst,
        waehrung: parsed.data.waehrung,
        kategorie: parsed.data.kategorie,
        zahlungsmethode: parsed.data.zahlungsmethode,
        rechnungsnummer: parsed.data.rechnungsnummer,
        driveLink,
        eingabeTyp: pending.source.kind === "upload" ? "foto" : pending.source.kind === "drive" ? "drive" : "sprache",
        erstelltAm: new Date().toISOString(),
      };
      await appendRow(sheets, user.sheetId, row);
      res.json({ ok: true, row });
    } catch (err) {
      next(err);
    }
  });

  router.get("/", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.sheetId) return res.json({ rows: [] });
      const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
      const sheets = sheetsFor(auth);
      const rows = await readAllRows(sheets, user.sheetId);
      res.json({ rows });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

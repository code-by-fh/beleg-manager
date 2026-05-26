import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { GeminiClient } from "../gemini/extract.js";
import type { PendingStore } from "./pendingStore.js";
import type { FailedVoiceRepo } from "./failedVoiceRepo.js";
import type { ReceiptRepo } from "./receiptRepo.js";
import { SOURCE_KIND_TO_EINGABE_TYP } from "./types.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { uploadSingleImage } from "../middleware/upload.js";
import { uploadRateLimit } from "../middleware/rateLimit.js";
import { buildOAuth2ClientForRefreshToken } from "../google/client.js";
import { driveFor, uploadFile, setAppProperties, downloadFile } from "../google/drive.js";
import { archiveExistingFile, archiveBuffer, buildReceiptFileName } from "./archive.js";
import { bootstrapUserDrive } from "../google/bootstrap.js";
import { logger } from "../logger.js";
import { cleanErrorMessage } from "../gemini/errors.js";

const log = logger.child({ module: "receipts-routes" });

function extractDriveFileId(driveLink: string): string | null {
  if (!driveLink) return null;
  const fdMatch = driveLink.match(/\/file\/d\/([^/?#]+)/);
  if (fdMatch && fdMatch[1]) return fdMatch[1];
  const idMatch = driveLink.match(/[?&]id=([^&#]+)/);
  if (idMatch && idMatch[1]) return idMatch[1];
  return null;
}

const VoiceBody = z.object({ transcript: z.string().min(1).max(4000) });

const ConfirmBody = z.object({
  pendingId: z.string().min(1),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  haendler: z.string().min(1),
  betrag: z.number().nonnegative(),
  mwst: z.number().nonnegative(),
  trinkgeld: z.number().nonnegative().default(0),
  waehrung: z.string().min(1),
  kategorie: z.string().min(1),
  zahlungsmethode: z.string().min(1),
  rechnungsnummer: z.string().default(""),
});

const UpdateBody = z.object({
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  haendler: z.string().min(1),
  betrag: z.number().nonnegative(),
  mwst: z.number().nonnegative(),
  trinkgeld: z.number().nonnegative().default(0),
  waehrung: z.string().min(1),
  kategorie: z.string().min(1),
  zahlungsmethode: z.string().min(1),
  rechnungsnummer: z.string().default(""),
});

const CSV_HEADER = "id,datum,haendler,betrag,mwst,trinkgeld,waehrung,kategorie,zahlungsmethode,rechnungsnummer,drive_link,eingabe_typ,erstellt_am";

function escapeCsv(v: string | number): string {
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export type ReceiptsDeps = {
  config: Config;
  userRepo: UserRepo;
  gemini: GeminiClient;
  pending: PendingStore;
  failedVoice: FailedVoiceRepo;
  receiptRepo: ReceiptRepo;
};

export function buildReceiptsRouter(deps: ReceiptsDeps) {
  const router = Router();
  router.use(requireAuth);

  router.post("/upload", uploadRateLimit, uploadSingleImage, async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "file required" });
      const userId = req.session.userId!;
      let user = deps.userRepo.getById(userId);
      if (!user?.refreshToken) return res.status(401).json({ error: "Kein Refresh-Token. Bitte erneut anmelden." });

      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      if (!user.driveInboxFolderId) {
        await bootstrapUserDrive(auth, userId, deps.userRepo);
        user = deps.userRepo.getById(userId);
      }
      if (!user?.driveInboxFolderId) return res.status(409).json({ error: "Drive inbox nicht verfügbar" });

      const drive = driveFor(auth);
      const ext = req.file.mimetype === "application/pdf" ? "pdf" : req.file.mimetype.split("/")[1] ?? "bin";
      const fileName = req.file.originalname || `beleg_${Date.now()}.${ext}`;
      await uploadFile(drive, {
        name: fileName,
        mimeType: req.file.mimetype,
        parentId: user.driveInboxFolderId,
        body: req.file.buffer,
      });
      log.info({ fileName, mimeType: req.file.mimetype, sizeBytes: req.file.size, userId }, "file uploaded to inbox");
      res.status(202).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post("/voice", uploadRateLimit, async (req, res, next) => {
    try {
      const parsed = VoiceBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });

      const userId = req.session.userId!;
      const transcript = parsed.data.transcript;
      const voiceUser = deps.userRepo.getById(userId);
      const customCatsVoice: string[] = JSON.parse(voiceUser?.customCategories || "[]");

      let extraction;
      try {
        extraction = await deps.gemini.extractFromTranscript(transcript, customCatsVoice);
      } catch (geminiErr) {
        log.error({ err: geminiErr }, "gemini extractFromTranscript failed");
        const jobId = deps.failedVoice.save({
          userId,
          transcript,
          error: cleanErrorMessage(geminiErr),
        });
        return res.json({ ok: false, jobId });
      }

      const datum = extraction.datum ?? new Date().toISOString().slice(0, 10);
      const haendler = extraction.haendler ?? "Unbekannt";
      const betrag = extraction.betrag ?? 0;

      const isDuplicate = deps.receiptRepo.checkDuplicate(userId, datum, haendler, betrag);
      if (isDuplicate) {
        return res.status(409).json({ error: "Duplikat erkannt: Dieser Beleg wurde bereits importiert." });
      }

      const row = {
        id: uuidv4(),
        datum,
        haendler,
        betrag,
        mwst: extraction.mwst ?? 0,
        trinkgeld: extraction.trinkgeld ?? 0,
        waehrung: extraction.waehrung ?? "EUR",
        kategorie: extraction.kategorie ?? "Sonstiges",
        zahlungsmethode: extraction.zahlungsmethode ?? "Unbekannt",
        rechnungsnummer: extraction.rechnungsnummer ?? "",
        driveLink: "",
        eingabeTyp: SOURCE_KIND_TO_EINGABE_TYP["voice"],
        erstelltAm: new Date().toISOString(),
      };
      deps.receiptRepo.insert(userId, row);

      log.info({ userId, haendler, betrag, datum }, "voice receipt saved");
      res.json({ ok: true });
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
      if (!user?.driveArchiveFolderId) {
        return res.status(409).json({ error: "user drive not bootstrapped" });
      }
      if (!user.refreshToken) {
        return res.status(401).json({ error: "Kein Refresh-Token. Bitte erneut anmelden." });
      }

      const isDuplicate = deps.receiptRepo.checkDuplicate(userId, parsed.data.datum, parsed.data.haendler, parsed.data.betrag);
      if (isDuplicate) {
        return res.status(409).json({ error: "Duplikat erkannt: Dieser Beleg wurde bereits importiert." });
      }

      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      const drive = driveFor(auth);

      let driveLink = "";
      if (pending.source.kind === "upload") {
        const ext = pending.source.mimeType === "application/pdf" ? "pdf" : pending.source.mimeType.split("/")[1] ?? "bin";
        const r = await archiveBuffer(drive, {
          name: buildReceiptFileName(parsed.data.datum, parsed.data.haendler, parsed.data.kategorie, ext),
          mimeType: pending.source.mimeType,
          buffer: pending.source.buffer,
          archiveRootId: user.driveArchiveFolderId,
          isoDate: parsed.data.datum,
        });
        driveLink = r.driveLink;
      } else if (pending.source.kind === "drive") {
        const ext = pending.source.mimeType === "application/pdf" ? "pdf" : pending.source.mimeType.split("/")[1] ?? "bin";
        const r = await archiveExistingFile(drive, pending.source.fileId, user.driveArchiveFolderId, parsed.data.datum,
          buildReceiptFileName(parsed.data.datum, parsed.data.haendler, parsed.data.kategorie, ext));
        driveLink = r.driveLink;
        await setAppProperties(drive, pending.source.fileId, { bm_status: "confirmed" }).catch(() => undefined);
      }

      const row = {
        id: uuidv4(),
        datum: parsed.data.datum,
        haendler: parsed.data.haendler,
        betrag: parsed.data.betrag,
        mwst: parsed.data.mwst,
        trinkgeld: parsed.data.trinkgeld,
        waehrung: parsed.data.waehrung,
        kategorie: parsed.data.kategorie,
        zahlungsmethode: parsed.data.zahlungsmethode,
        rechnungsnummer: parsed.data.rechnungsnummer,
        driveLink,
        eingabeTyp: SOURCE_KIND_TO_EINGABE_TYP[pending.source.kind],
        erstelltAm: new Date().toISOString(),
        positions: pending.extraction.positions || null,
      };
      deps.receiptRepo.insert(userId, row);
      log.info({ userId, haendler: row.haendler, betrag: row.betrag, pendingId: parsed.data.pendingId, source: pending.source.kind }, "receipt confirmed and archived");
      res.json({ ok: true, row });
    } catch (err) {
      next(err);
    }
  });

  router.get("/pending/:id", (req, res) => {
    const userId = req.session.userId!;
    const entry = deps.pending.peek(userId, req.params.id);
    if (!entry) return res.status(404).json({ error: "pending not found or expired" });
    res.json({
      pendingId: entry.id,
      extraction: entry.extraction,
      mimeType: entry.source && "mimeType" in entry.source ? entry.source.mimeType : null
    });
  });

  router.get("/pending/:id/preview", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const entry = deps.pending.peek(userId, req.params.id);
      if (!entry) return res.status(404).json({ error: "pending not found or expired" });

      const source = entry.source;
      if (source.kind === "upload" || source.kind === "telegram" || source.kind === "email") {
        if ("buffer" in source && "mimeType" in source) {
          res.setHeader("Content-Type", source.mimeType);
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("X-Content-Type-Options", "nosniff");
          res.end(source.buffer);
          return;
        }
      } else if (source.kind === "drive") {
        const user = deps.userRepo.getById(userId);
        if (!user?.refreshToken) return res.status(503).json({ error: "user drive unavailable" });

        const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
        const drive = driveFor(auth);
        const meta = await drive.files.get({ fileId: source.fileId, fields: "mimeType" });
        const mimeType = meta.data.mimeType ?? "application/octet-stream";
        const buffer = await downloadFile(drive, source.fileId);
        res.setHeader("Content-Type", mimeType);
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.end(buffer);
        return;
      }

      res.status(400).json({ error: "preview not supported for this source" });
    } catch (err) {
      log.error({ err }, "pending-preview error");
      next(err);
    }
  });

  router.delete("/pending/:id", async (req, res, next) => {
    try {
      const pendingId = req.params.id;
      const userId = req.session.userId!;
      const pending = deps.pending.take(userId, pendingId);

      if (pending) {
        const source = pending.source;
        if (source.kind === "drive") {
          const user = deps.userRepo.getById(userId);
          if (user?.refreshToken) {
            const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
            const drive = driveFor(auth);
            await setAppProperties(drive, source.fileId, { bm_status: "confirmed" }).catch((err) => {
              log.error({ err, fileId: source.fileId }, "failed to set bm_status for pending delete");
            });
          }
        }
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.get("/failed-voice", (req, res) => {
    const userId = req.session.userId!;
    const jobs = deps.failedVoice.listForUser(userId);
    res.json({ jobs });
  });

  router.post("/retry-voice/:jobId", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const job = deps.failedVoice.getById(userId, req.params.jobId);
      if (!job) return res.status(404).json({ error: "job not found" });
      const retryUser = deps.userRepo.getById(userId);
      const customCatsRetry: string[] = JSON.parse(retryUser?.customCategories || "[]");

      let extraction;
      try {
        extraction = await deps.gemini.extractFromTranscript(job.transcript, customCatsRetry);
      } catch (geminiErr) {
        log.error({ err: geminiErr }, "gemini extractFromTranscript failed (retry)");
        return res.status(502).json({ error: cleanErrorMessage(geminiErr) });
      }

      const datum = extraction.datum ?? new Date().toISOString().slice(0, 10);
      const haendler = extraction.haendler ?? "Unbekannt";
      const betrag = extraction.betrag ?? 0;

      const isDuplicate = deps.receiptRepo.checkDuplicate(userId, datum, haendler, betrag);
      if (isDuplicate) {
        return res.status(409).json({ error: "Duplikat erkannt: Dieser Beleg wurde bereits importiert." });
      }

      const row = {
        id: uuidv4(),
        datum,
        haendler,
        betrag,
        mwst: extraction.mwst ?? 0,
        trinkgeld: extraction.trinkgeld ?? 0,
        waehrung: extraction.waehrung ?? "EUR",
        kategorie: extraction.kategorie ?? "Sonstiges",
        zahlungsmethode: extraction.zahlungsmethode ?? "Unbekannt",
        rechnungsnummer: extraction.rechnungsnummer ?? "",
        driveLink: "",
        eingabeTyp: SOURCE_KIND_TO_EINGABE_TYP["voice"],
        erstelltAm: new Date().toISOString(),
      };
      deps.receiptRepo.insert(userId, row);

      deps.failedVoice.delete(userId, job.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.get("/duplicate-check", (req, res) => {
    const { haendler, betrag, datum } = req.query;
    if (typeof haendler !== "string" || typeof betrag !== "string" || typeof datum !== "string") {
      return res.status(400).json({ error: "haendler, betrag, datum required" });
    }
    const parsedBetrag = parseFloat(betrag);
    if (isNaN(parsedBetrag)) return res.status(400).json({ error: "betrag must be a number" });

    const userId = req.session.userId!;
    const isDuplicate = deps.receiptRepo.checkDuplicate(userId, datum, haendler, parsedBetrag);
    res.json({ duplicate: isDuplicate ? { datum, haendler, betrag: parsedBetrag } : null });
  });

  router.get("/export/csv", (req, res) => {
    const userId = req.session.userId!;
    const rows = deps.receiptRepo.findAll(userId);
    const lines = rows.map((r) =>
      [r.id, r.datum, r.haendler, r.betrag, r.mwst, r.trinkgeld, r.waehrung,
       r.kategorie, r.zahlungsmethode, r.rechnungsnummer, r.driveLink, r.eingabeTyp, r.erstelltAm]
        .map(escapeCsv)
        .join(",")
    );
    const csv = [CSV_HEADER, ...lines].join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="belege.csv"');
    res.send(csv);
  });

  router.get("/", (req, res) => {
    const userId = req.session.userId!;
    const rows = deps.receiptRepo.findAll(userId);
    res.json({ rows });
  });

  router.post("/:id/positions", (req, res) => {
    const userId = req.session.userId!;
    const receipt = deps.receiptRepo.findById(userId, req.params.id);
    if (!receipt) return res.status(404).json({ error: "receipt not found" });
    return res.json({ items: receipt.positions ?? [], total: receipt.betrag });
  });

  router.put("/:id", (req, res) => {
    const parsed = UpdateBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });

    const userId = req.session.userId!;
    const existing = deps.receiptRepo.findById(userId, req.params.id);
    if (!existing) return res.status(404).json({ error: "receipt not found" });

    const updated = {
      ...existing,
      datum: parsed.data.datum,
      haendler: parsed.data.haendler,
      betrag: parsed.data.betrag,
      mwst: parsed.data.mwst,
      trinkgeld: parsed.data.trinkgeld,
      waehrung: parsed.data.waehrung,
      kategorie: parsed.data.kategorie,
      zahlungsmethode: parsed.data.zahlungsmethode,
      rechnungsnummer: parsed.data.rechnungsnummer,
    };

    const ok = deps.receiptRepo.update(userId, updated);
    if (!ok) return res.status(404).json({ error: "receipt not found" });
    res.json({ ok: true, row: updated });
  });

  router.delete("/:id", (req, res) => {
    const userId = req.session.userId!;
    const ok = deps.receiptRepo.delete(userId, req.params.id);
    if (!ok) return res.status(404).json({ error: "receipt not found" });
    res.json({ ok: true });
  });

  return router;
}

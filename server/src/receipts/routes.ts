import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { GeminiClient } from "../gemini/extract.js";
import type { PendingStore } from "./pendingStore.js";
import type { FailedVoiceRepo } from "./failedVoiceRepo.js";
import { SOURCE_KIND_TO_EINGABE_TYP } from "./types.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { uploadSingleImage } from "../middleware/upload.js";
import { uploadRateLimit } from "../middleware/rateLimit.js";
import { buildOAuth2ClientFromSession } from "../google/client.js";
import { driveFor, uploadFile } from "../google/drive.js";
import { sheetsFor, appendRow, readAllRows, updateRow, deleteRow, SHEET_TAB_NAME, type ReceiptRow } from "../google/sheets.js";
import { archiveExistingFile, archiveBuffer } from "./archive.js";
import { bootstrapUserDrive } from "../google/bootstrap.js";

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

export type ReceiptsDeps = {
  config: Config;
  userRepo: UserRepo;
  gemini: GeminiClient;
  pending: PendingStore;
  failedVoice: FailedVoiceRepo;
};

export function buildReceiptsRouter(deps: ReceiptsDeps) {
  const router = Router();
  router.use(requireAuth);

  router.post("/upload", uploadRateLimit, uploadSingleImage, async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "file required" });
      const userId = req.session.userId!;
      let user = deps.userRepo.getById(userId);
      if (!user?.refreshToken) return res.status(401).json({ error: "Kein Refresh-Token" });

      if (!user.driveInboxFolderId) {
        const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
        await bootstrapUserDrive(auth, userId, deps.userRepo);
        user = deps.userRepo.getById(userId);
      }
      if (!user?.driveInboxFolderId) return res.status(409).json({ error: "Drive inbox nicht verfügbar" });

      const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
      const drive = driveFor(auth);
      const ext = req.file.mimetype === "application/pdf" ? "pdf" : req.file.mimetype.split("/")[1] ?? "bin";
      const fileName = req.file.originalname || `beleg_${Date.now()}.${ext}`;
      await uploadFile(drive, {
        name: fileName,
        mimeType: req.file.mimetype,
        parentId: user.driveInboxFolderId,
        body: req.file.buffer,
      });
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

      let extraction;
      try {
        extraction = await deps.gemini.extractFromTranscript(transcript);
      } catch (geminiErr) {
        const jobId = deps.failedVoice.save({
          userId,
          transcript,
          error: String((geminiErr as Error).message ?? geminiErr),
        });
        return res.json({ ok: false, jobId });
      }

      const user = deps.userRepo.getById(userId);
      if (user?.sheetId) {
        const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
        const sheets = sheetsFor(auth);
        const datum = extraction.datum ?? new Date().toISOString().slice(0, 10);
        const row: ReceiptRow = {
          id: uuidv4(),
          datum,
          haendler: extraction.haendler ?? "Unbekannt",
          betrag: extraction.betrag ?? 0,
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
        await appendRow(sheets, user.sheetId, row);
      }

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

      const row: ReceiptRow = {
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
      };
      await appendRow(sheets, user.sheetId, row);
      res.json({ ok: true, row });
    } catch (err) {
      next(err);
    }
  });

  router.get("/pending/:id", (req, res) => {
    const userId = req.session.userId!;
    const entry = deps.pending.peek(userId, req.params.id);
    if (!entry) return res.status(404).json({ error: "pending not found or expired" });
    res.json({ pendingId: entry.id, extraction: entry.extraction });
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

      let extraction;
      try {
        extraction = await deps.gemini.extractFromTranscript(job.transcript);
      } catch (geminiErr) {
        return res.status(502).json({ error: String((geminiErr as Error).message ?? geminiErr) });
      }

      const user = deps.userRepo.getById(userId);
      if (user?.sheetId) {
        const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
        const sheets = sheetsFor(auth);
        const datum = extraction.datum ?? new Date().toISOString().slice(0, 10);
        const row: ReceiptRow = {
          id: uuidv4(),
          datum,
          haendler: extraction.haendler ?? "Unbekannt",
          betrag: extraction.betrag ?? 0,
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
        await appendRow(sheets, user.sheetId, row);
      }

      deps.failedVoice.delete(userId, job.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.get("/duplicate-check", async (req, res, next) => {
    try {
      const { haendler, betrag, datum } = req.query;
      if (typeof haendler !== "string" || typeof betrag !== "string" || typeof datum !== "string") {
        return res.status(400).json({ error: "haendler, betrag, datum required" });
      }
      const parsedBetrag = parseFloat(betrag);
      if (isNaN(parsedBetrag)) return res.status(400).json({ error: "betrag must be a number" });

      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.sheetId) return res.json({ duplicate: null });

      const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
      const sheets = sheetsFor(auth);

      const scanRes = await sheets.spreadsheets.values.get({
        spreadsheetId: user.sheetId,
        range: `${SHEET_TAB_NAME}!A2:D`,
      });
      const rawRows = (scanRes.data.values ?? []) as string[][];

      const targetMs = new Date(datum).getTime();
      const oneDayMs = 86_400_000;
      const haendlerLc = haendler.trim().toLowerCase();

      const matchedRaw = rawRows.find((r) => {
        const rowMs = new Date(r[1] ?? "").getTime();
        const rowBetrag = parseFloat(String(r[3] ?? "").replace(",", "."));
        return (
          (r[2] ?? "").trim().toLowerCase() === haendlerLc &&
          rowBetrag === parsedBetrag &&
          !isNaN(rowMs) &&
          Math.abs(rowMs - targetMs) <= oneDayMs
        );
      });

      if (!matchedRaw) return res.json({ duplicate: null });

      const allRows = await readAllRows(sheets, user.sheetId);
      const duplicate = allRows.find((r) => r.id === matchedRaw[0]) ?? null;

      res.json({ duplicate: duplicate ?? null });
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

  router.put("/:id", async (req, res, next) => {
    try {
      const parsed = UpdateBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });

      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.sheetId) return res.status(409).json({ error: "user drive not bootstrapped" });

      const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
      const sheets = sheetsFor(auth);

      const allRows = await readAllRows(sheets, user.sheetId);
      const existing = allRows.find((r) => r.id === req.params.id);
      if (!existing) return res.status(404).json({ error: "receipt not found" });

      const updated: ReceiptRow = {
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

      const ok = await updateRow(sheets, user.sheetId, updated);
      if (!ok) return res.status(404).json({ error: "receipt not found in sheet" });

      res.json({ ok: true, row: updated });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.sheetId) return res.status(409).json({ error: "user drive not bootstrapped" });

      const auth = buildOAuth2ClientFromSession(deps.config.google, req.session);
      const sheets = sheetsFor(auth);

      const ok = await deleteRow(sheets, user.sheetId, req.params.id);
      if (!ok) return res.status(404).json({ error: "receipt not found" });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

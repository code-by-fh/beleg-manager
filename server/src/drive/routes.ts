import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { GeminiClient } from "../gemini/extract.js";
import type { PendingStore } from "../receipts/pendingStore.js";
import type { ReceiptRepo } from "../receipts/receiptRepo.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { buildOAuth2ClientForRefreshToken } from "../google/client.js";
import { bootstrapUserDrive } from "../google/bootstrap.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "drive-routes" });
import { driveFor, listFolderFiles, downloadFile, setAppProperties, listSubfolders } from "../google/drive.js";
import { archiveExistingFile, buildReceiptFileName } from "../receipts/archive.js";
import { SOURCE_KIND_TO_EINGABE_TYP } from "../receipts/types.js";
import { cleanErrorMessage } from "../gemini/errors.js";

export type DriveRoutesDeps = {
  config: Config;
  userRepo: UserRepo;
  gemini: GeminiClient;
  pending: PendingStore;
  receiptRepo: ReceiptRepo;
};

const SUPPORTED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const ArchiveFolderParamZ = z.object({ folderId: z.string().min(1) });
const ArchiveFileParamZ = z.object({ fileId: z.string().min(1) });

export function buildDriveRouter(deps: DriveRoutesDeps) {
  const router = Router();
  router.use(requireAuth);

  router.get("/inbox", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      let user = deps.userRepo.getById(userId);
      if (!user?.refreshToken) return res.status(401).json({ error: "Kein Refresh-Token. Bitte erneut anmelden." });
      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      if (!user.driveInboxFolderId) {
        await bootstrapUserDrive(auth, userId, deps.userRepo);
        user = deps.userRepo.getById(userId);
        if (!user?.driveInboxFolderId) return res.json({ files: [] });
      }
      const drive = driveFor(auth);
      const files = await listFolderFiles(drive, user.driveInboxFolderId);
      const enriched = files
        .filter((f) => f.appProperties?.bm_status !== "confirmed")
        .map((f) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          status: f.appProperties?.bm_status ?? "new",
          extracted: f.appProperties?.bm_extracted_json ? JSON.parse(f.appProperties.bm_extracted_json) : null,
          error: f.appProperties?.bm_error ?? null,
        }));
      res.json({ files: enriched });
    } catch (err) {
      log.error({ err }, "inbox fetch failed");
      if ((err as any).code === 401 || (err as any).code === 403) {
        return res.status((err as any).code).json({ error: "Google Drive Zugriff verweigert. Bitte erneut anmelden." });
      }
      next(err);
    }
  });

  router.get("/inbox/:fileId/preview", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.refreshToken) return res.status(401).json({ error: "Kein Refresh-Token. Bitte erneut anmelden." });

      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      const drive = driveFor(auth);
      const meta = await drive.files.get({ fileId: req.params.fileId, fields: "mimeType" });
      const mimeType = meta.data.mimeType ?? "application/octet-stream";
      const buffer = await downloadFile(drive, req.params.fileId);
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Length", buffer.length);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.end(buffer);
    } catch (err) {
      next(err);
    }
  });

  router.post("/reset", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.refreshToken) return res.status(401).json({ error: "Kein Refresh-Token. Bitte erneut anmelden." });
      deps.userRepo.clearDriveFolderIds(userId);
      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      await bootstrapUserDrive(auth, userId, deps.userRepo);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post("/import/:fileId", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.driveInboxFolderId) return res.status(409).json({ error: "drive not bootstrapped" });

      if (!user.refreshToken) return res.status(401).json({ error: "Kein Refresh-Token. Bitte erneut anmelden." });
      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      const drive = driveFor(auth);
      const files = await listFolderFiles(drive, user.driveInboxFolderId);
      const file = files.find((f) => f.id === req.params.fileId);
      if (!file) return res.status(404).json({ error: "file not in inbox" });
      if (!SUPPORTED.has(file.mimeType)) {
        return res.status(415).json({ error: `unsupported mime: ${file.mimeType}` });
      }

      let extraction;
      try {
        const buffer = await downloadFile(drive, file.id);
        const customCats: string[] = JSON.parse(user.customCategories || "[]");
        extraction = await deps.gemini.extractFromPhoto({ mimeType: file.mimeType, buffer }, undefined, customCats);
      } catch (err) {
        await setAppProperties(drive, file.id, {
          bm_status: "failed",
          bm_error: cleanErrorMessage(err),
        }).catch(() => undefined);
        throw err;
      }

      const pendingId = deps.pending.put({
        userId,
        source: { kind: "drive", fileId: file.id, mimeType: file.mimeType },
        extraction,
      });
      await setAppProperties(drive, file.id, {
        bm_status: "pending_review",
        bm_extracted_json: JSON.stringify(extraction),
        bm_error: "",
      }).catch(() => undefined);
      log.info({ fileId: file.id, fileName: file.name, pendingId, userId }, "file imported from inbox");
      res.json({ pendingId, extraction, fileName: file.name, mimeType: file.mimeType });
    } catch (err) {
      next(err);
    }
  });

  const ManualConfirmBody = z.object({
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

  router.post("/inbox/:fileId/confirm-manual", async (req, res, next) => {
    try {
      const parsed = ManualConfirmBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "invalid body", details: parsed.error.flatten() });

      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.refreshToken) return res.status(401).json({ error: "Kein Refresh-Token" });
      if (!user.driveArchiveFolderId) {
        return res.status(409).json({ error: "Drive nicht eingerichtet" });
      }

      const isDuplicate = deps.receiptRepo.checkDuplicate(userId, parsed.data.datum, parsed.data.haendler, parsed.data.betrag);
      if (isDuplicate) {
        return res.status(409).json({ error: "Duplikat erkannt: Dieser Beleg wurde bereits importiert." });
      }

      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      const drive = driveFor(auth);

      const fileMeta = await drive.files.get({ fileId: req.params.fileId, fields: "mimeType" });
      const mimeType = fileMeta.data.mimeType ?? "application/octet-stream";
      const ext = mimeType === "application/pdf" ? "pdf" : mimeType.split("/")[1] ?? "bin";
      const { driveLink } = await archiveExistingFile(
        drive,
        req.params.fileId,
        user.driveArchiveFolderId,
        parsed.data.datum,
        buildReceiptFileName(parsed.data.datum, parsed.data.haendler, parsed.data.kategorie, ext),
      );

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
        eingabeTyp: SOURCE_KIND_TO_EINGABE_TYP["drive"],
        erstelltAm: new Date().toISOString(),
      };
      deps.receiptRepo.insert(userId, row);

      await setAppProperties(drive, req.params.fileId, { bm_status: "confirmed" }).catch(() => undefined);

      log.info({ fileId: req.params.fileId, userId, haendler: row.haendler, betrag: row.betrag }, "manual confirm: receipt created and archived");
      res.json({ ok: true, row });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/inbox/:fileId", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.refreshToken) return res.status(401).json({ error: "Kein Refresh-Token" });

      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      const drive = driveFor(auth);
      await setAppProperties(drive, req.params.fileId, { bm_status: "confirmed" }).catch(() => undefined);
      log.info({ fileId: req.params.fileId, userId }, "file skipped in inbox");
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.get("/archive/tree", async (req, res, next) => {
    try {
      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.refreshToken) return res.status(401).json({ error: "Kein Refresh-Token. Bitte erneut anmelden." });
      if (!user.driveArchiveFolderId) return res.json({ years: [] });

      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      const drive = driveFor(auth);

      const yearFolders = await listSubfolders(drive, user.driveArchiveFolderId);
      const years = await Promise.all(
        yearFolders.map(async (year) => {
          const months = await listSubfolders(drive, year.id);
          return { id: year.id, name: year.name, months };
        })
      );

      res.json({ years });
    } catch (err) {
      next(err);
    }
  });

  router.get("/archive/:folderId/files", async (req, res, next) => {
    try {
      const paramParsed = ArchiveFolderParamZ.safeParse(req.params);
      if (!paramParsed.success) return res.status(400).json({ error: "invalid params" });

      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.refreshToken) return res.status(401).json({ error: "Kein Refresh-Token. Bitte erneut anmelden." });

      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      const drive = driveFor(auth);

      const rawFiles = await drive.files.list({
        q: `'${paramParsed.data.folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
        fields: "files(id,name,mimeType,modifiedTime)",
        pageSize: 100,
        orderBy: "name",
      });

      const files = (rawFiles.data.files ?? []).map((f) => ({
        id: f.id!,
        name: f.name!,
        mimeType: f.mimeType ?? "application/octet-stream",
        modifiedTime: f.modifiedTime ?? "",
      }));

      res.json({ files });
    } catch (err) {
      next(err);
    }
  });

  router.get("/archive/:fileId/preview", async (req, res, next) => {
    try {
      const paramParsed = ArchiveFileParamZ.safeParse(req.params);
      if (!paramParsed.success) return res.status(400).json({ error: "invalid params" });

      const userId = req.session.userId!;
      const user = deps.userRepo.getById(userId);
      if (!user?.refreshToken) return res.status(401).json({ error: "Kein Refresh-Token. Bitte erneut anmelden." });

      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      const drive = driveFor(auth);

      const meta = await drive.files.get({ fileId: paramParsed.data.fileId, fields: "mimeType" });
      const mimeType = meta.data.mimeType ?? "application/octet-stream";
      const buffer = await downloadFile(drive, paramParsed.data.fileId);
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Length", buffer.length);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.end(buffer);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

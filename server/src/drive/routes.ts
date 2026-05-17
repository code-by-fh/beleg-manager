import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import type { GeminiClient } from "../gemini/extract.js";
import type { PendingStore } from "../receipts/pendingStore.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { buildOAuth2ClientForRefreshToken } from "../google/client.js";
import { bootstrapUserDrive } from "../google/bootstrap.js";
import { driveFor, listFolderFiles, downloadFile, setAppProperties } from "../google/drive.js";
import { sheetsFor, appendRow, type ReceiptRow } from "../google/sheets.js";
import { archiveExistingFile } from "../receipts/archive.js";
import { SOURCE_KIND_TO_EINGABE_TYP } from "../receipts/types.js";

export type DriveRoutesDeps = {
  config: Config;
  userRepo: UserRepo;
  gemini: GeminiClient;
  pending: PendingStore;
};

const SUPPORTED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

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
        }));
      res.json({ files: enriched });
    } catch (err) {
      console.error("[drive] inbox fetch failed:", err);
      if ((err as any).code === 401 || (err as any).code === 403) {
        return res.status((err as any).code).json({ error: "Google Drive Zugriff verweigert. Bitte erneut anmelden." });
      }
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

      const buffer = await downloadFile(drive, file.id);
      const extraction = await deps.gemini.extractFromPhoto({ mimeType: file.mimeType, buffer });
      const pendingId = deps.pending.put({
        userId,
        source: { kind: "drive", fileId: file.id, mimeType: file.mimeType },
        extraction,
      });
      await setAppProperties(drive, file.id, {
        bm_status: "pending_review",
        bm_extracted_json: JSON.stringify(extraction),
      }).catch(() => undefined);
      res.json({ pendingId, extraction, fileName: file.name });
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
      if (!user.driveArchiveFolderId || !user.sheetId) {
        return res.status(409).json({ error: "Drive nicht eingerichtet" });
      }

      const auth = buildOAuth2ClientForRefreshToken(deps.config.google, user.refreshToken);
      const drive = driveFor(auth);

      const { driveLink } = await archiveExistingFile(
        drive,
        req.params.fileId,
        user.driveArchiveFolderId,
        parsed.data.datum,
      );

      const sheets = sheetsFor(auth);
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
        eingabeTyp: SOURCE_KIND_TO_EINGABE_TYP["drive"],
        erstelltAm: new Date().toISOString(),
      };
      await appendRow(sheets, user.sheetId, row);

      await setAppProperties(drive, req.params.fileId, { bm_status: "confirmed" }).catch(() => undefined);

      res.json({ ok: true, row });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

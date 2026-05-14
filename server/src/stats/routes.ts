import { Router } from "express";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { buildOAuth2ClientForRefreshToken } from "../google/client.js";
import { sheetsFor, readAllRows } from "../google/sheets.js";
import { computeSummary, computeMonthly, computeCategories, computeTopMerchants, computePaymentMethods } from "./compute.js";

export function buildStatsRouter(config: Config, userRepo: UserRepo) {
  const router = Router();
  router.use(requireAuth);

  async function loadRows(req: any) {
    const userId = req.session.userId as string;
    const user = userRepo.getById(userId);
    if (!user?.sheetId || !user.refreshToken) return [];
    const auth = buildOAuth2ClientForRefreshToken(config.google, user.refreshToken);
    const sheets = sheetsFor(auth);
    try {
      return await readAllRows(sheets, user.sheetId);
    } catch (err: any) {
      if (err?.status === 404 || err?.code === 404) {
        console.warn(`[stats] spreadsheet ${user.sheetId} not found, returning empty`);
        return [];
      }
      throw err;
    }
  }

  router.get("/summary", async (req, res, next) => {
    try { res.json(computeSummary(await loadRows(req))); } catch (e) { next(e); }
  });
  router.get("/monthly", async (req, res, next) => {
    try { res.json(computeMonthly(await loadRows(req))); } catch (e) { next(e); }
  });
  router.get("/categories", async (req, res, next) => {
    try { res.json(computeCategories(await loadRows(req))); } catch (e) { next(e); }
  });
  router.get("/top-merchants", async (req, res, next) => {
    try { res.json(computeTopMerchants(await loadRows(req))); } catch (e) { next(e); }
  });
  router.get("/payment-methods", async (req, res, next) => {
    try { res.json(computePaymentMethods(await loadRows(req))); } catch (e) { next(e); }
  });

  return router;
}

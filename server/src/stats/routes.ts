import { Router } from "express";
import type { UserRepo } from "../auth/userRepo.js";
import type { ReceiptRepo } from "../receipts/receiptRepo.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { computeSummary, computeMonthly, computeCategories, computeTopMerchants, computePaymentMethods } from "./compute.js";

export function buildStatsRouter(userRepo: UserRepo, receiptRepo: ReceiptRepo) {
  const router = Router();
  router.use(requireAuth);

  function loadRows(req: any) {
    const userId = req.session.userId as string;
    return receiptRepo.findAll(userId);
  }

  router.get("/summary", (req, res, next) => {
    try { res.json(computeSummary(loadRows(req))); } catch (e) { next(e); }
  });
  router.get("/monthly", (req, res, next) => {
    try { res.json(computeMonthly(loadRows(req))); } catch (e) { next(e); }
  });
  router.get("/categories", (req, res, next) => {
    try { res.json(computeCategories(loadRows(req))); } catch (e) { next(e); }
  });
  router.get("/top-merchants", (req, res, next) => {
    try { res.json(computeTopMerchants(loadRows(req))); } catch (e) { next(e); }
  });
  router.get("/payment-methods", (req, res, next) => {
    try { res.json(computePaymentMethods(loadRows(req))); } catch (e) { next(e); }
  });

  return router;
}

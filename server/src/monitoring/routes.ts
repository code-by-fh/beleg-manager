import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import type { HealthRepo } from "./repo.js";

export function buildMonitoringRouter(healthRepo: HealthRepo) {
  const router = Router();
  router.use(requireAuth);

  router.get("/health", (_req, res) => {
    res.json({ services: healthRepo.listAll() });
  });

  return router;
}

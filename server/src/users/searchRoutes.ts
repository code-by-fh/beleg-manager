import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/requireAuth.js";
import type { Db } from "../db/index.js";
import { SearchQuerySchema } from "../split-requests/schema.js";

const searchLimit = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.session?.userId ?? req.ip) as string,
});

export function buildUsersRouter(db: Db) {
  const router = Router();
  router.use(requireAuth);

  router.get("/search", searchLimit, (req, res, next) => {
    try {
      const parsed = SearchQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: "invalid query", details: parsed.error.flatten() });
      }

      const { q } = parsed.data;
      const pattern = `%${q}%`;
      const userId = req.session.userId!;

      const users = db
        .prepare(
          `SELECT id, name, email FROM users
           WHERE (name LIKE ? OR email LIKE ?) AND id != ?
           LIMIT 10`
        )
        .all(pattern, pattern, userId) as Array<{ id: string; name: string; email: string }>;

      res.json({ users });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

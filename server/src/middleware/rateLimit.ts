import rateLimit from "express-rate-limit";

export const uploadRateLimit = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.session?.userId ?? req.ip) as string,
});

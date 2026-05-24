import { z } from "zod";

export const CreateShareLinkBody = z.object({
  personName: z.string().min(1).max(200),
  personEmail: z.string().email(),
});

export const TokenParams = z.object({
  token: z.string().min(1).max(100),
});

export const IdParams = z.object({
  id: z.string().uuid(),
});

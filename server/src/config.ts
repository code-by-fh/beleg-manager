import { z } from "zod";

const Schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  SESSION_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  OAUTH_CALLBACK_URL: z.string().url(),
  GEMINI_API_KEY: z.string().default(""),
  CLIENT_ORIGIN: z.string().url(),
  APP_PUBLIC_URL: z.string().url().optional(),
});

export type Config = {
  port: number;
  nodeEnv: "development" | "production" | "test";
  sessionSecret: string;
  google: { clientId: string; clientSecret: string; callbackUrl: string };
  geminiApiKey: string;
  clientOrigin: string;
  appPublicUrl: string;
};

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): Config {
  const parsed = Schema.parse(env);
  return {
    port: parsed.PORT,
    nodeEnv: parsed.NODE_ENV,
    sessionSecret: parsed.SESSION_SECRET,
    google: {
      clientId: parsed.GOOGLE_CLIENT_ID,
      clientSecret: parsed.GOOGLE_CLIENT_SECRET,
      callbackUrl: parsed.OAUTH_CALLBACK_URL,
    },
    geminiApiKey: parsed.GEMINI_API_KEY,
    clientOrigin: parsed.CLIENT_ORIGIN,
    appPublicUrl: parsed.APP_PUBLIC_URL ?? parsed.CLIENT_ORIGIN,
  };
}

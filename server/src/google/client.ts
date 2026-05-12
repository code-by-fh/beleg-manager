import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

export type GoogleCfg = { clientId: string; clientSecret: string; callbackUrl: string };
export type SessionTokens = {
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiry?: number;
};

export function buildOAuth2ClientFromSession(cfg: GoogleCfg, tokens: SessionTokens): OAuth2Client {
  const client = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, cfg.callbackUrl);
  client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.accessTokenExpiry,
  });
  return client;
}

export function buildOAuth2ClientForRefreshToken(cfg: GoogleCfg, refreshToken: string): OAuth2Client {
  const client = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, cfg.callbackUrl);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

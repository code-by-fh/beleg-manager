import passport from "passport";
import { Strategy as GoogleStrategy, type Profile, type VerifyCallback } from "passport-google-oauth20";
import type { Config } from "../config.js";
import type { UserRepo } from "./userRepo.js";

export type GoogleAuthInfo = {
  userId: string;
  email: string;
  name: string;
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number | null;
};

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];

export function configurePassport(config: Config, userRepo: UserRepo) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.google.clientId,
        clientSecret: config.google.clientSecret,
        callbackURL: config.google.callbackUrl,
        passReqToCallback: false,
      },
      (
        accessToken: string,
        refreshToken: string,
        params: { expires_in?: number },
        profile: Profile,
        done: VerifyCallback
      ) => {
        const email = profile.emails?.[0]?.value;
        const name = profile.displayName ?? email ?? profile.id;
        if (!email) return done(new Error("Google profile missing email"));
        userRepo.upsert({
          id: profile.id,
          email,
          name,
          refreshToken: refreshToken ?? null,
        });
        const info: GoogleAuthInfo = {
          userId: profile.id,
          email,
          name,
          accessToken,
          refreshToken: refreshToken ?? null,
          expiresInSeconds: params?.expires_in ?? null,
        };
        return done(null, info);
      }
    )
  );

  // We do not use passport sessions; we manage the session ourselves in routes.
  passport.serializeUser((info: any, cb) => cb(null, info));
  passport.deserializeUser((info: any, cb) => cb(null, info));

  return passport;
}

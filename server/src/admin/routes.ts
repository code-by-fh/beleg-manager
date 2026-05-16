import { Router, type Response } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import type { Config } from "../config.js";
import type { UserRepo } from "../auth/userRepo.js";
import { buildOAuth2ClientForRefreshToken } from "../google/client.js";
import {
  resetLocalData,
  resetGoogleDrive,
  type FactoryResetResponse,
} from "./factoryReset.js";
import type { Db } from "../db/index.js";

export function buildAdminRouter(
  config: Config,
  userRepo: UserRepo,
  db: Db
): Router {
  const router = Router();

  router.post(
    "/factory-reset",
    requireAuth,
    async (req, res: Response<FactoryResetResponse>) => {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentifizierung erforderlich",
          results: {},
        });
      }

      const { localData = false, googleDrive = false } = req.body as {
        localData?: boolean;
        googleDrive?: boolean;
      };

      // Validation
      if (!localData && !googleDrive) {
        return res.status(400).json({
          success: false,
          message: "Mindestens eine Reset-Option muss ausgewählt werden",
          results: {},
        });
      }

      const user = userRepo.getById(userId);
      if (!user) {
        return res.status(400).json({
          success: false,
          message: "Nutzer nicht gefunden",
          results: {},
        });
      }

      const results: FactoryResetResponse["results"] = {};
      let allSuccess = true;

      // Reset local data
      if (localData) {
        try {
          const localResult = await resetLocalData(db, userId);
          results.localData = localResult;
          if (!localResult.success) {
            allSuccess = false;
          }
          console.log(`[factory-reset] userId=${userId} localData=${localResult.success}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          results.localData = {
            success: false,
            message,
          };
          allSuccess = false;
          console.error(`[factory-reset] userId=${userId} localData failed: ${message}`);
        }
      }

      // Reset Google Drive
      if (googleDrive) {
        try {
          if (!user.refreshToken) {
            results.googleDrive = {
              success: false,
              message: "Kein Refresh-Token vorhanden - Google Drive kann nicht zugegriffen werden",
            };
            allSuccess = false;
          } else {
            const oauth2Client = buildOAuth2ClientForRefreshToken(
              {
                clientId: config.google.clientId,
                clientSecret: config.google.clientSecret,
                callbackUrl: config.google.callbackUrl,
              },
              user.refreshToken
            );
            const driveResult = await resetGoogleDrive(oauth2Client, user);
            results.googleDrive = driveResult;
            if (!driveResult.success) {
              allSuccess = false;
            }
            console.log(`[factory-reset] userId=${userId} googleDrive=${driveResult.success}`);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          results.googleDrive = {
            success: false,
            message,
          };
          allSuccess = false;
          console.error(`[factory-reset] userId=${userId} googleDrive failed: ${message}`);
        }
      }

      const statusCode = allSuccess ? 200 : 207;

      return res.status(statusCode).json({
        success: allSuccess,
        message: allSuccess
          ? "Factory Reset abgeschlossen"
          : "Factory Reset teilweise erfolgreich",
        results,
      });
    }
  );

  return router;
}

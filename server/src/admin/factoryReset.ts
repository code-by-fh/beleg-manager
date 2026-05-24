import Database from "better-sqlite3";
import type { Db } from "../db/index.js";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import type { UserRow } from "../auth/userRepo.js";

export type ResetResult = {
  success: boolean;
  message: string;
  retried?: number;
};

export type FactoryResetResponse = {
  success: boolean;
  message: string;
  results: {
    localData?: ResetResult;
    googleDrive?: ResetResult;
  };
};

const RETRY_DELAYS = [100, 200, 400]; // ms

async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<{ result: T | null; retryCount: number; error: Error | null }> {
  let lastError: Error | null = null;
  let retryCount = 0;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await operation();
      return { result, retryCount: i, error: null };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      retryCount = i + 1;
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[i]));
      }
    }
  }

  return { result: null, retryCount, error: lastError };
}

export async function resetLocalData(db: Db, userId: string): Promise<ResetResult> {
  try {
    // Explicit deletions in dependency order (children before parent)
    db.prepare("DELETE FROM split_bank_links WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM split_requests WHERE from_user_id = ? OR to_user_id = ?").run(userId, userId);
    db.prepare("DELETE FROM bank_transactions WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM receipts WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM failed_uploads WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM failed_voice_jobs WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM gmail_processed_messages WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);

    // Delete all sessions for this user
    const sessionDb = new Database("data/sessions.sqlite");
    try {
      // Get all sessions and find ones belonging to this user
      const sessions = sessionDb
        .prepare("SELECT sid, sess FROM sessions")
        .all() as Array<{ sid: string; sess: string }>;

      const sessionIdsToDelete: string[] = [];
      for (const session of sessions) {
        try {
          const data = JSON.parse(session.sess) as { data?: { userId?: string } };
          if (data.data?.userId === userId) {
            sessionIdsToDelete.push(session.sid);
          }
        } catch {
          // Skip malformed sessions
        }
      }

      // Delete matching sessions
      for (const sid of sessionIdsToDelete) {
        sessionDb.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
      }
    } finally {
      sessionDb.close();
    }

    return {
      success: true,
      message: "Lokale Daten und Sessions gelöscht",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Fehler beim Löschen lokaler Daten: ${message}`);
  }
}

export async function resetGoogleDrive(
  oauth2Client: OAuth2Client,
  user: UserRow
): Promise<ResetResult> {
  if (!user.driveRootFolderId) {
    return {
      success: true,
      message: "Keine Google Drive Daten vorhanden (Ordner nicht erstellt)",
    };
  }

  try {
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // Delete root folder (which contains Archive and Inbox)
    const { result: folderResult, retryCount: folderRetries, error: folderError } =
      await retryOperation(async () => {
        await drive.files.delete({ fileId: user.driveRootFolderId! });
        return true;
      }, 3);

    if (!folderResult) {
      const folderErrorMsg =
        folderError?.message || "Unbekannter Fehler beim Löschen des Ordners";
      return {
        success: false,
        message: `Nach ${folderRetries} Versuchen fehlgeschlagen: ${folderErrorMsg}`,
        retried: folderRetries,
      };
    }

    return {
      success: true,
      message: "Beleg-Manager-Ordner gelöscht",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Fehler beim Löschen von Google Drive Daten: ${message}`,
      retried: 0,
    };
  }
}

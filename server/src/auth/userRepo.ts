import type { Db } from "../db/index.js";

export type UserRow = {
  id: string;
  email: string;
  name: string;
  driveRootFolderId: string | null;
  driveInboxFolderId: string | null;
  driveArchiveFolderId: string | null;
  sheetId: string | null;
  refreshToken: string | null;
  createdAt: number;
};

type UpsertInput = { id: string; email: string; name: string; refreshToken: string | null };

type DriveAssets = {
  driveRootFolderId: string;
  driveInboxFolderId: string;
  driveArchiveFolderId: string;
  sheetId: string;
};

export function createUserRepo(db: Db) {
  return {
    upsert(input: UpsertInput): void {
      db.prepare(
        `INSERT INTO users (id, email, name, refresh_token, created_at)
         VALUES (@id, @email, @name, @refreshToken, @createdAt)
         ON CONFLICT(id) DO UPDATE SET
           email = excluded.email,
           name = excluded.name,
           refresh_token = COALESCE(excluded.refresh_token, users.refresh_token)`
      ).run({ ...input, createdAt: Date.now() });
    },

    getById(id: string): UserRow | undefined {
      const row = db
        .prepare(
          `SELECT id, email, name,
            drive_root_folder_id AS driveRootFolderId,
            drive_inbox_folder_id AS driveInboxFolderId,
            drive_archive_folder_id AS driveArchiveFolderId,
            sheet_id AS sheetId,
            refresh_token AS refreshToken,
            created_at AS createdAt
           FROM users WHERE id = ?`
        )
        .get(id) as UserRow | undefined;
      return row;
    },

    setDriveAssets(id: string, assets: DriveAssets): void {
      db.prepare(
        `UPDATE users SET
          drive_root_folder_id = @driveRootFolderId,
          drive_inbox_folder_id = @driveInboxFolderId,
          drive_archive_folder_id = @driveArchiveFolderId,
          sheet_id = @sheetId
         WHERE id = @id`
      ).run({ id, ...assets });
    },

    listAllWithRefreshToken(): UserRow[] {
      return db
        .prepare(
          `SELECT id, email, name,
            drive_root_folder_id AS driveRootFolderId,
            drive_inbox_folder_id AS driveInboxFolderId,
            drive_archive_folder_id AS driveArchiveFolderId,
            sheet_id AS sheetId,
            refresh_token AS refreshToken,
            created_at AS createdAt
           FROM users WHERE refresh_token IS NOT NULL`
        )
        .all() as UserRow[];
    },
  };
}

export type UserRepo = ReturnType<typeof createUserRepo>;

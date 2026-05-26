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
  gmailPollingEnabled: boolean;
  gmailLabelFilter: string;
  telegramBotToken: string | null;
  receiptsViewMode: "table" | "list" | null;
  startPage: string;
  customCategories: string;
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
            created_at AS createdAt,
            gmail_polling_enabled AS gmailPollingEnabled,
            gmail_label_filter AS gmailLabelFilter,
            telegram_bot_token AS telegramBotToken,
            receipts_view_mode AS receiptsViewMode,
            start_page AS startPage,
            COALESCE(custom_categories, '[]') AS customCategories
           FROM users WHERE id = ?`
        )
        .get(id) as (Omit<UserRow, "gmailPollingEnabled"> & { gmailPollingEnabled: number }) | undefined;
      if (!row) return undefined;
      return { ...row, gmailPollingEnabled: row.gmailPollingEnabled === 1 };
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
      const rows = db
        .prepare(
          `SELECT id, email, name,
            drive_root_folder_id AS driveRootFolderId,
            drive_inbox_folder_id AS driveInboxFolderId,
            drive_archive_folder_id AS driveArchiveFolderId,
            sheet_id AS sheetId,
            refresh_token AS refreshToken,
            created_at AS createdAt,
            gmail_polling_enabled AS gmailPollingEnabled,
            gmail_label_filter AS gmailLabelFilter,
            telegram_bot_token AS telegramBotToken,
            receipts_view_mode AS receiptsViewMode,
            start_page AS startPage,
            COALESCE(custom_categories, '[]') AS customCategories
           FROM users WHERE refresh_token IS NOT NULL`
        )
        .all() as (Omit<UserRow, "gmailPollingEnabled"> & { gmailPollingEnabled: number })[];
      return rows.map((r) => ({ ...r, gmailPollingEnabled: r.gmailPollingEnabled === 1 }));
    },

    setGmailSettings(id: string, enabled: boolean, labelFilter: string): void {
      db.prepare(
        `UPDATE users SET gmail_polling_enabled = @enabled, gmail_label_filter = @labelFilter WHERE id = @id`
      ).run({ id, enabled: enabled ? 1 : 0, labelFilter });
    },

    setTelegramBotToken(id: string, token: string | null): void {
      db.prepare("UPDATE users SET telegram_bot_token = @token WHERE id = @id").run({ id, token });
    },
    setUISettings(id: string, settings: { receiptsViewMode?: "table" | "list"; startPage?: string }): void {
      if (settings.receiptsViewMode) {
        db.prepare("UPDATE users SET receipts_view_mode = @mode WHERE id = @id").run({ id, mode: settings.receiptsViewMode });
      }
      if (settings.startPage) {
        db.prepare("UPDATE users SET start_page = @page WHERE id = @id").run({ id, page: settings.startPage });
      }
    },

    setCustomCategories(id: string, categories: string[]): void {
      db.prepare("UPDATE users SET custom_categories = @cats WHERE id = @id").run({ id, cats: JSON.stringify(categories) });
    },

    clearDriveFolderIds(id: string): void {
      db.prepare(
        `UPDATE users SET drive_root_folder_id = NULL, drive_inbox_folder_id = NULL, drive_archive_folder_id = NULL, sheet_id = NULL WHERE id = ?`
      ).run(id);
    },

    deleteUser(id: string): void {
      db.prepare("DELETE FROM users WHERE id = ?").run(id);
    },
  };
}

export type UserRepo = ReturnType<typeof createUserRepo>;

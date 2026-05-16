import { randomUUID } from "node:crypto";
import type { Db } from "../db/index.js";

export type FailedVoiceJob = {
  id: string;
  userId: string;
  transcript: string;
  error: string;
  createdAt: number;
};

export function createFailedVoiceRepo(db: Db) {
  return {
    save(input: { userId: string; transcript: string; error: string }): string {
      const id = randomUUID();
      db.prepare(
        "INSERT INTO failed_voice_jobs (id, user_id, transcript, error, created_at) VALUES (?, ?, ?, ?, ?)"
      ).run(id, input.userId, input.transcript, input.error, Date.now());
      return id;
    },

    listForUser(userId: string): FailedVoiceJob[] {
      return db
        .prepare(
          "SELECT id, user_id as userId, transcript, error, created_at as createdAt FROM failed_voice_jobs WHERE user_id = ? ORDER BY created_at DESC"
        )
        .all(userId) as FailedVoiceJob[];
    },

    getById(userId: string, id: string): FailedVoiceJob | null {
      return (
        (db
          .prepare(
            "SELECT id, user_id as userId, transcript, error, created_at as createdAt FROM failed_voice_jobs WHERE id = ? AND user_id = ?"
          )
          .get(id, userId) as FailedVoiceJob | undefined) ?? null
      );
    },

    delete(userId: string, id: string): void {
      db.prepare("DELETE FROM failed_voice_jobs WHERE id = ? AND user_id = ?").run(id, userId);
    },
  };
}

export type FailedVoiceRepo = ReturnType<typeof createFailedVoiceRepo>;

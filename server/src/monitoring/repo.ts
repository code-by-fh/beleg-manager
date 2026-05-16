import type { Db } from "../db/index.js";

export type ServiceStatus = "ok" | "error" | "unknown";

export type HealthEntry = {
  serviceName: string;
  lastRunAt: number;
  status: ServiceStatus;
  itemsProcessed: number;
  itemsFailed: number;
  lastError: string | null;
  updatedAt: number;
};

export type HealthRepo = {
  upsert(entry: Omit<HealthEntry, "updatedAt">): void;
  listAll(): HealthEntry[];
};

export function createHealthRepo(db: Db): HealthRepo {
  const upsertStmt = db.prepare<[string, number, string, number, number, string | null, number]>(`
    INSERT INTO service_health
      (service_name, last_run_at, status, items_processed, items_failed, last_error, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(service_name) DO UPDATE SET
      last_run_at     = excluded.last_run_at,
      status          = excluded.status,
      items_processed = excluded.items_processed,
      items_failed    = excluded.items_failed,
      last_error      = excluded.last_error,
      updated_at      = excluded.updated_at
  `);

  const listAllStmt = db.prepare<[], {
    service_name: string;
    last_run_at: number;
    status: string;
    items_processed: number;
    items_failed: number;
    last_error: string | null;
    updated_at: number;
  }>(`SELECT * FROM service_health`);

  return {
    upsert(entry) {
      upsertStmt.run(
        entry.serviceName,
        entry.lastRunAt,
        entry.status,
        entry.itemsProcessed,
        entry.itemsFailed,
        entry.lastError ?? null,
        Date.now(),
      );
    },
    listAll() {
      return listAllStmt.all().map((row) => ({
        serviceName: row.service_name,
        lastRunAt: row.last_run_at,
        status: row.status as ServiceStatus,
        itemsProcessed: row.items_processed,
        itemsFailed: row.items_failed,
        lastError: row.last_error,
        updatedAt: row.updated_at,
      }));
    },
  };
}

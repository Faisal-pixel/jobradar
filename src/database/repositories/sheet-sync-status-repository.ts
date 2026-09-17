import type { DatabaseSync } from "node:sqlite";
import type { SheetSyncStatus } from "../../domain/sheets/sheet-sync-status.js";

// Same threshold/reasoning as SourceHealthRepository (Phase 2).
const FAILING_THRESHOLD = 3;

export class SheetSyncStatusRepository {
  constructor(private readonly db: DatabaseSync) {}

  get(target: string): SheetSyncStatus | null {
    const row = this.db.prepare("SELECT * FROM sheet_sync_status WHERE target = ?").get(target);
    return (row as unknown as SheetSyncStatus) ?? null;
  }

  list(): SheetSyncStatus[] {
    const rows = this.db.prepare("SELECT * FROM sheet_sync_status ORDER BY target").all();
    return rows as unknown as SheetSyncStatus[];
  }

  recordSuccess(target: string): SheetSyncStatus {
    const row = this.db
      .prepare(
        `INSERT INTO sheet_sync_status (target, status, last_success_at, consecutive_failures, last_error, updated_at)
         VALUES (?, 'healthy', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 0, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT (target) DO UPDATE SET
           status = 'healthy',
           last_success_at = excluded.last_success_at,
           consecutive_failures = 0,
           last_error = NULL,
           updated_at = excluded.updated_at
         RETURNING *`,
      )
      .get(target);
    return row as unknown as SheetSyncStatus;
  }

  recordFailure(target: string, errorMessage: string): SheetSyncStatus {
    const existing = this.get(target);
    const consecutiveFailures = (existing?.consecutive_failures ?? 0) + 1;
    const status = consecutiveFailures >= FAILING_THRESHOLD ? "failing" : "degraded";

    const row = this.db
      .prepare(
        `INSERT INTO sheet_sync_status (target, status, last_failure_at, consecutive_failures, last_error, updated_at)
         VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT (target) DO UPDATE SET
           status = excluded.status,
           last_failure_at = excluded.last_failure_at,
           consecutive_failures = excluded.consecutive_failures,
           last_error = excluded.last_error,
           updated_at = excluded.updated_at
         RETURNING *`,
      )
      .get(target, status, consecutiveFailures, errorMessage);
    return row as unknown as SheetSyncStatus;
  }
}

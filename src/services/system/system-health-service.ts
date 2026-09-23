import type { DatabaseSync } from "node:sqlite";
import { SourceHealthRepository } from "../../database/repositories/source-health-repository.js";
import { SheetSyncStatusRepository } from "../../database/repositories/sheet-sync-status-repository.js";
import type { SourceHealth } from "../../domain/sources/source-health.js";
import type { SheetSyncStatus } from "../../domain/sheets/sheet-sync-status.js";

export interface SystemHealth {
  sources: SourceHealth[];
  sheets: SheetSyncStatus[];
}

export interface SystemError {
  kind: "source" | "sheet";
  target: string;
  status: string;
  lastError: string;
  lastFailureAt: string | null;
}

// A narrow rollup of the two health tables that already exist
// (source_health from Phase 2, sheet_sync_status from Phase 4) — not a
// general application-wide error log, since none exists. No Telegram
// entry here either: Decisions Log #36 deliberately has no persisted
// Telegram health table. Broadening this (e.g. once Phase 10's scheduler
// exists) is expected, not a limitation to fix now.
export class SystemHealthService {
  private readonly sourceHealth: SourceHealthRepository;
  private readonly sheetSyncStatus: SheetSyncStatusRepository;

  constructor(db: DatabaseSync) {
    this.sourceHealth = new SourceHealthRepository(db);
    this.sheetSyncStatus = new SheetSyncStatusRepository(db);
  }

  getSystemHealth(): SystemHealth {
    return {
      sources: this.sourceHealth.list(),
      sheets: this.sheetSyncStatus.list(),
    };
  }

  // Only entries currently carrying a last_error — the "what's actually
  // wrong right now" lens, distinct from get_system_health's full picture
  // (which also shows healthy entries).
  getErrors(): SystemError[] {
    const sourceErrors: SystemError[] = this.sourceHealth
      .list()
      .filter((entry) => entry.last_error !== null)
      .map((entry) => ({
        kind: "source" as const,
        target: entry.source,
        status: entry.status,
        lastError: entry.last_error as string,
        lastFailureAt: entry.last_failure_at,
      }));

    const sheetErrors: SystemError[] = this.sheetSyncStatus
      .list()
      .filter((entry) => entry.last_error !== null)
      .map((entry) => ({
        kind: "sheet" as const,
        target: entry.target,
        status: entry.status,
        lastError: entry.last_error as string,
        lastFailureAt: entry.last_failure_at,
      }));

    return [...sourceErrors, ...sheetErrors];
  }
}

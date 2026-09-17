export const SHEET_SYNC_STATUSES = ["healthy", "degraded", "failing"] as const;
export type SheetSyncStatusValue = (typeof SHEET_SYNC_STATUSES)[number];

// Mirrors src/domain/sources/source-health.ts's shape exactly — same
// healthy/degraded/failing semantics, same reason for existing (backs
// CLAUDE.md's `get_sheet_status` MCP tool, Phase 7).
export interface SheetSyncStatus {
  target: string;
  status: SheetSyncStatusValue;
  last_success_at: string | null;
  last_failure_at: string | null;
  consecutive_failures: number;
  last_error: string | null;
  updated_at: string;
}

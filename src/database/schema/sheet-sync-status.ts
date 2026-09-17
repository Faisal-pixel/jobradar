export const SHEET_SYNC_STATUS_TABLE = "sheet_sync_status";

// Same shape/reasoning as source_health (Phase 2) — keyed by `target`
// (e.g. "google_sheets") rather than a surrogate id, since there's one
// row per sync target.
export const SHEET_SYNC_STATUS_CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS sheet_sync_status (
  target                  TEXT PRIMARY KEY,
  status                  TEXT NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy', 'degraded', 'failing')),
  last_success_at         TEXT,
  last_failure_at         TEXT,
  consecutive_failures    INTEGER NOT NULL DEFAULT 0,
  last_error              TEXT,
  updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`;

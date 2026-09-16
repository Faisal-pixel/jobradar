export const SOURCE_HEALTH_TABLE = "source_health";

// Keyed by `source` (the adapter's name), not a surrogate integer id —
// there is exactly one health row per source, so the natural key is
// simpler than Decisions Log #2's usual INTEGER AUTOINCREMENT.
export const SOURCE_HEALTH_CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS source_health (
  source                 TEXT PRIMARY KEY,
  status                 TEXT NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy', 'degraded', 'failing')),
  last_success_at        TEXT,
  last_failure_at        TEXT,
  consecutive_failures   INTEGER NOT NULL DEFAULT 0,
  last_error             TEXT,
  updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`;

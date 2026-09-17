export const COMPANIES_TABLE = "companies";

// This is migration 001's exact original SQL — frozen, not a live
// "current shape" reference. Columns added later (e.g. `last_active` in
// migration 003) live only in their own migration file, not here; editing
// this string would silently change what a brand-new database gets from
// migration 001, while existing databases wouldn't be affected at all.
export const COMPANIES_CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS companies (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  website        TEXT,
  domain         TEXT,
  yc_batch       TEXT,
  team_size      INTEGER,
  industry       TEXT,
  description    TEXT,
  funding        TEXT,
  funding_stage  TEXT,
  location       TEXT,
  remote_policy  TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`;

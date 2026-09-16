export const COMPANIES_TABLE = "companies";

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

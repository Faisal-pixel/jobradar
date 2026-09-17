export const CANDIDATE_PROFILE_TABLE = "candidate_profile";

// Single-row table — there is exactly one candidate (Faisal). List/range
// preferences are stored as JSON-in-TEXT rather than flat columns: this
// row is always read as one whole object, never filtered by SQL WHERE,
// so a handful of JSON columns beat a dozen-plus min/max columns.
export const CANDIDATE_PROFILE_CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS candidate_profile (
  id                           INTEGER PRIMARY KEY CHECK (id = 1),
  location                     TEXT,
  -- ISO 3166-1 alpha-2 code (e.g. "NG"). Work at a Startup's remote
  -- listings restrict by country code ("US / CA / GB / ..."), never by
  -- full country name — Remote Eligibility scoring needs the code to
  -- ever actually match a real listing.
  location_code                TEXT,
  target_titles                TEXT NOT NULL DEFAULT '[]',
  stack_interest                TEXT NOT NULL DEFAULT '[]',
  company_size_sweet_spot      TEXT,
  company_size_secondary       TEXT,
  company_size_opportunistic   TEXT,
  prefer_recent_yc_batch       INTEGER NOT NULL DEFAULT 1,
  notes                        TEXT,
  created_at                   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at                   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`;

export const PEOPLE_TABLE = "people";

export const PEOPLE_CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS people (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id     INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  name           TEXT,
  role           TEXT,
  category       TEXT CHECK (category IS NULL OR category IN (
                    'founder', 'cofounder', 'ceo', 'cto', 'engineering_lead',
                    'engineer', 'recruiter', 'hr', 'talent', 'other'
                  )),
  linkedin_url   TEXT,
  email          TEXT,
  source         TEXT,
  source_url     TEXT,
  confidence     TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_people_company_id ON people(company_id);
`;

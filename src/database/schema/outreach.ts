export const OUTREACH_TABLE = "outreach";

export const OUTREACH_CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS outreach (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id       INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  person_id        INTEGER REFERENCES people(id) ON DELETE SET NULL,
  job_id           INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  channel          TEXT CHECK (channel IS NULL OR channel IN ('linkedin', 'email', 'twitter', 'other')),
  date_contacted   TEXT,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
                      'draft', 'planned', 'contacted', 'responded',
                      'no_response', 'follow_up', 'closed'
                    )),
  response         TEXT,
  follow_up_date   TEXT,
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_outreach_company_id ON outreach(company_id);
CREATE INDEX IF NOT EXISTS idx_outreach_person_id ON outreach(person_id);
CREATE INDEX IF NOT EXISTS idx_outreach_job_id ON outreach(job_id);
`;

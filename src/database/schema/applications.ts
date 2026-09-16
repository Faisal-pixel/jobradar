export const APPLICATIONS_TABLE = "applications";

export const APPLICATIONS_CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS applications (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id            INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
  company_id        INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  role              TEXT,
  application_url   TEXT,
  date_applied      TEXT,
  status            TEXT NOT NULL DEFAULT 'planned' CHECK (status IN (
                       'planned', 'applied', 'screening', 'technical',
                       'onsite', 'offer', 'rejected', 'withdrawn'
                     )),
  interview_stage   TEXT,
  rejection_reason  TEXT,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_company_id ON applications(company_id);
`;

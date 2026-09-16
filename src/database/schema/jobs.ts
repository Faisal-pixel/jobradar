export const JOBS_TABLE = "jobs";

export const JOBS_CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS jobs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id        INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  location          TEXT,
  remote            INTEGER,
  salary_min        INTEGER,
  salary_max        INTEGER,
  salary_currency   TEXT,
  description       TEXT,
  job_url           TEXT,
  application_url   TEXT,
  source            TEXT NOT NULL,
  source_job_id     TEXT NOT NULL,
  date_found        TEXT,
  date_posted       TEXT,
  fit_score         INTEGER,
  fit_category      TEXT CHECK (fit_category IS NULL OR fit_category IN ('A', 'B', 'skip')),
  fit_explanation   TEXT,
  status            TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
                       'new', 'reviewed', 'qualified', 'skipped', 'applied',
                       'interviewing', 'rejected', 'closed', 'archived'
                     )),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (source, source_job_id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
`;

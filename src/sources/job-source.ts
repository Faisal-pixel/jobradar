import type { NewJob } from "../domain/jobs/job.js";
import type { NewCompany } from "../domain/companies/company.js";

// A job as an adapter reports it: paired with the company data needed to
// resolve/create companies.company_id. Adapters never touch SQLite, so
// they can't know DB-assigned fields (id, created_at, updated_at) before
// a row exists — this is CLAUDE.md's sketched `Job[]` return narrowed to
// the pre-insert NewJob/NewCompany shapes from Phase 1.
export interface DiscoveredJob {
  job: NewJob;
  company: NewCompany;
}

// A lightweight, adapter-computed "can I reach the site right now" check.
// This is distinct from the persisted SourceHealth record (src/domain/sources/source-health.ts),
// which is the historical, run-over-run status the SourceManager builds up
// in the database — an adapter has no memory of past runs, only the
// present moment, so CLAUDE.md's sketched `healthCheck(): Promise<SourceHealth>`
// is narrowed to this simpler ad-hoc result.
export interface SourceHealthCheck {
  healthy: boolean;
  message?: string;
}

export interface JobSource {
  name: string;
  discoverJobs(): Promise<DiscoveredJob[]>;
  getJob?(id: string): Promise<DiscoveredJob | null>;
  healthCheck(): Promise<SourceHealthCheck>;
}

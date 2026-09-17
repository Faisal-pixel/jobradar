import type { DatabaseSync } from "node:sqlite";
import { JobsRepository } from "../../database/repositories/jobs-repository.js";
import { CompaniesRepository } from "../../database/repositories/companies-repository.js";
import type { TelegramClient } from "./telegram-client.js";
import { formatJobAlert } from "./templates.js";
import { logger } from "../../shared/logger.js";

export interface JobAlertsSummary {
  candidates: number;
  sent: number;
  failed: number;
}

// Instant alerts for Category-A jobs only — B counts belong in the daily
// digest as a summary, not an individual ping each. jobs.alerted_at is
// what makes re-running this safe: already-alerted jobs are skipped, and
// one message failing to send doesn't stop the others (same isolation
// spirit as Phase 2's SourceManager).
export class JobAlertsService {
  private readonly jobs: JobsRepository;
  private readonly companies: CompaniesRepository;

  constructor(
    db: DatabaseSync,
    private readonly telegram: TelegramClient,
  ) {
    this.jobs = new JobsRepository(db);
    this.companies = new CompaniesRepository(db);
  }

  async run(): Promise<JobAlertsSummary> {
    const candidates = this.jobs.findUnalertedByCategory("A");
    let sent = 0;
    let failed = 0;

    for (const job of candidates) {
      const company = job.company_id !== null ? this.companies.findById(job.company_id) : null;
      try {
        await this.telegram.sendMessage(formatJobAlert(job, company?.name ?? null));
        this.jobs.update(job.id, { alerted_at: new Date().toISOString() });
        sent++;
      } catch (cause) {
        failed++;
        logger.error("Failed to send job alert", { jobId: job.id, error: String(cause) });
      }
    }

    logger.info("Job alerts run complete", { candidates: candidates.length, sent, failed });
    return { candidates: candidates.length, sent, failed };
  }
}

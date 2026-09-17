import type { DatabaseSync } from "node:sqlite";
import { JobsRepository } from "../../database/repositories/jobs-repository.js";
import { CompaniesRepository } from "../../database/repositories/companies-repository.js";
import type { TelegramClient } from "./telegram-client.js";
import { formatDigest } from "./templates.js";
import { logger } from "../../shared/logger.js";

const LOOKBACK_HOURS = 24;

export interface DailyDigestSummary {
  jobCount: number;
}

// Stateless by design — no "last digest sent" tracking, unlike job
// alerts. A digest is a summary snapshot; re-running it and seeing
// overlapping content is harmless, so a fixed lookback window is simpler
// than persisted state for something that doesn't need de-dup.
export class DailyDigestService {
  private readonly jobs: JobsRepository;
  private readonly companies: CompaniesRepository;

  constructor(
    db: DatabaseSync,
    private readonly telegram: TelegramClient,
  ) {
    this.jobs = new JobsRepository(db);
    this.companies = new CompaniesRepository(db);
  }

  async run(): Promise<DailyDigestSummary> {
    const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
    const jobs = this.jobs.findDiscoveredSince(since);

    const companyNameCache = new Map<number, string | null>();
    const companyNameByJobId = new Map<number, string>();
    for (const job of jobs) {
      if (job.company_id === null) continue;
      if (!companyNameCache.has(job.company_id)) {
        companyNameCache.set(job.company_id, this.companies.findById(job.company_id)?.name ?? null);
      }
      const name = companyNameCache.get(job.company_id);
      if (name) companyNameByJobId.set(job.id, name);
    }

    const message = formatDigest(jobs, companyNameByJobId, `in the last ${LOOKBACK_HOURS}h`);
    await this.telegram.sendMessage(message);

    logger.info("Daily digest sent", { jobCount: jobs.length });
    return { jobCount: jobs.length };
  }
}

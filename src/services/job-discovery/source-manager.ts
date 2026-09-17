import type { DatabaseSync } from "node:sqlite";
import type { JobSource, DiscoveredJob } from "../../sources/job-source.js";
import type { Company } from "../../domain/companies/company.js";
import { CompaniesRepository } from "../../database/repositories/companies-repository.js";
import { JobsRepository } from "../../database/repositories/jobs-repository.js";
import { PeopleRepository } from "../../database/repositories/people-repository.js";
import { SourceHealthRepository } from "../../database/repositories/source-health-repository.js";
import { logger } from "../../shared/logger.js";

export interface SourceRunResult {
  source: string;
  ok: boolean;
  jobsFound: number;
  jobsCreated: number;
  jobsSkipped: number;
  error?: string;
}

// Runs each configured source in isolation: one source's failure (bad
// HTML, timeout, the site changing shape) is caught, logged, and recorded
// as a source-health failure — it never stops the remaining sources from
// running, and never crashes whatever called runAll() (the future
// scheduler, or a manual run today).
export class SourceManager {
  private readonly companies: CompaniesRepository;
  private readonly jobs: JobsRepository;
  private readonly people: PeopleRepository;
  private readonly sourceHealth: SourceHealthRepository;

  constructor(
    db: DatabaseSync,
    private readonly sources: JobSource[],
  ) {
    this.companies = new CompaniesRepository(db);
    this.jobs = new JobsRepository(db);
    this.people = new PeopleRepository(db);
    this.sourceHealth = new SourceHealthRepository(db);
  }

  async runAll(): Promise<SourceRunResult[]> {
    const results: SourceRunResult[] = [];
    for (const source of this.sources) {
      results.push(await this.runOne(source));
    }
    return results;
  }

  private async runOne(source: JobSource): Promise<SourceRunResult> {
    try {
      const discovered = await source.discoverJobs();
      let created = 0;
      let skipped = 0;

      for (const candidate of discovered) {
        // Exact dedup: UNIQUE(source, source_job_id), checked before any
        // detail-page fetch — an already-known job costs nothing extra.
        const existing = this.jobs.findBySource(source.name, candidate.job.source_job_id);
        if (existing) {
          skipped++;
          continue;
        }

        const enriched = await this.enrich(source, candidate);
        const wasCreated = this.persist(enriched, source.name);
        if (wasCreated) created++;
        else skipped++;
      }

      this.sourceHealth.recordSuccess(source.name);
      logger.info("Source run complete", {
        source: source.name,
        found: discovered.length,
        created,
        skipped,
      });
      return { source: source.name, ok: true, jobsFound: discovered.length, jobsCreated: created, jobsSkipped: skipped };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      this.sourceHealth.recordFailure(source.name, message);
      logger.error("Source run failed", { source: source.name, error: message });
      return { source: source.name, ok: false, jobsFound: 0, jobsCreated: 0, jobsSkipped: 0, error: message };
    }
  }

  // Only genuinely new jobs get enriched — this is what keeps request
  // volume proportional to *new* jobs per run (Decisions Log #12), not
  // the full candidate list from every search query.
  private async enrich(source: JobSource, candidate: DiscoveredJob): Promise<DiscoveredJob> {
    if (!source.getJob) return candidate;
    try {
      const detailed = await source.getJob(candidate.job.source_job_id);
      if (!detailed) return candidate;
      return {
        // Keep the original discovery timestamp rather than the moment
        // enrichment happened seconds later.
        job: { ...detailed.job, date_found: candidate.job.date_found ?? null },
        // last_active only ever comes from the cheap (search) tier — the
        // detail-page payload doesn't carry it at all, so a plain
        // replace here would silently lose it for nearly every job
        // (almost all persisted jobs go through enrichment).
        company: { ...detailed.company, last_active: candidate.company.last_active ?? null },
        founders: detailed.founders ?? [],
      };
    } catch (cause) {
      logger.warn("Detail enrichment failed, falling back to cheap-tier data", {
        source: source.name,
        sourceJobId: candidate.job.source_job_id,
        error: String(cause),
      });
      return candidate;
    }
  }

  private persist(discovered: DiscoveredJob, sourceName: string): boolean {
    const { company, isNew } = this.findOrCreateCompany(discovered.company);

    // Founders are only attached the moment a company is first created —
    // same "no backfill onto an existing company" policy as the company
    // fields themselves (see findOrCreateCompany).
    if (isNew) this.persistFounders(company.id, discovered.founders);

    // Cross-source dedup fallback (CLAUDE.md's "normalized company + role"
    // rule): same company, same title, reported by a different source.
    const duplicate = this.jobs.findPotentialDuplicate(company.id, discovered.job.title, sourceName);
    if (duplicate) {
      logger.info("Cross-source duplicate detected, skipping", {
        source: sourceName,
        title: discovered.job.title,
        existingJobId: duplicate.id,
      });
      return false;
    }

    this.jobs.create({ ...discovered.job, company_id: company.id });
    return true;
  }

  // Reuses an existing company row by name rather than creating a
  // duplicate on every run. Known limitation: if the existing row came
  // from a cheap-tier-only pass, it won't retroactively gain detail-tier
  // fields (website, team size) just because a later job brings richer
  // company data — that's backfill/research territory, not discovery.
  private findOrCreateCompany(company: DiscoveredJob["company"]): { company: Company; isNew: boolean } {
    const existing = this.companies.findByName(company.name);
    if (existing) return { company: existing, isNew: false };
    return { company: this.companies.create(company), isNew: true };
  }

  private persistFounders(companyId: number, founders: DiscoveredJob["founders"]): void {
    if (!founders || founders.length === 0) return;
    for (const founder of founders) {
      this.people.create({ ...founder, company_id: companyId });
    }
  }
}

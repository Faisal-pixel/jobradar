import type { DatabaseSync } from "node:sqlite";
import { JobsRepository } from "../../database/repositories/jobs-repository.js";
import { WorkAtAStartupSource } from "../../sources/workatastartup/index.js";
import { NotFoundError } from "../../shared/errors.js";

export interface JobFieldChange {
  field: string;
  previousValue: unknown;
  currentValue: unknown;
}

export interface JobResearchResult {
  jobId: number;
  stillListed: boolean;
  changes: JobFieldChange[];
  checkedAt: string;
}

// Read-only — re-fetches the live posting and reports what's different,
// it never writes the change back onto the stored Job row itself (no
// MCP tool exists for a raw job-status/field update outside
// update_application's Job.status nudging — Decisions Log #42 — so
// there's nowhere safe for this to write to even if it wanted to).
export class JobResearchService {
  private readonly jobs: JobsRepository;
  private readonly waas: WorkAtAStartupSource;

  constructor(db: DatabaseSync) {
    this.jobs = new JobsRepository(db);
    this.waas = new WorkAtAStartupSource();
  }

  async researchJob(jobId: number): Promise<JobResearchResult> {
    const job = this.jobs.findById(jobId);
    if (!job) throw new NotFoundError("Job", jobId);

    const checkedAt = new Date().toISOString();

    if (job.source !== "workatastartup") {
      // No other source exists yet (Decisions Log #10) — this guards the
      // day one does, rather than silently mis-researching it.
      return { jobId, stillListed: true, changes: [], checkedAt };
    }

    const fresh = await this.waas.getJob(job.source_job_id);
    if (!fresh) {
      return { jobId, stillListed: false, changes: [], checkedAt };
    }

    const changes: JobFieldChange[] = [];
    const compare = (field: string, previousValue: unknown, currentValue: unknown) => {
      if (previousValue !== currentValue) changes.push({ field, previousValue, currentValue });
    };

    compare("title", job.title, fresh.job.title);
    compare("location", job.location, fresh.job.location ?? null);
    compare("salary_min", job.salary_min, fresh.job.salary_min ?? null);
    compare("salary_max", job.salary_max, fresh.job.salary_max ?? null);
    compare("salary_currency", job.salary_currency, fresh.job.salary_currency ?? null);
    // Full-text description diffing would be noisy (minor rewording
    // shouldn't read as a "change") — a boolean is enough to flag "go
    // look at this again" without drowning the result in prose.
    if ((job.description ?? "") !== (fresh.job.description ?? "")) {
      changes.push({ field: "description", previousValue: "(stored version)", currentValue: "(changed — re-fetch to see)" });
    }

    return { jobId, stillListed: true, changes, checkedAt };
  }
}

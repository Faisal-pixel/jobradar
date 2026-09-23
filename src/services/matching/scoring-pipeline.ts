import type { DatabaseSync } from "node:sqlite";
import { JobsRepository } from "../../database/repositories/jobs-repository.js";
import { CompaniesRepository } from "../../database/repositories/companies-repository.js";
import { PeopleRepository } from "../../database/repositories/people-repository.js";
import { CandidateProfileRepository } from "../../database/repositories/candidate-profile-repository.js";
import { scoreJob } from "./fit-scorer.js";
import { logger } from "../../shared/logger.js";
import type { Job } from "../../domain/jobs/job.js";
import type { CandidateProfile } from "../../domain/candidate-profile/candidate-profile.js";
import { NotFoundError } from "../../shared/errors.js";

export interface ScoringSummary {
  scored: number;
}

// Scores every job that hasn't been scored yet and writes the result
// back — every discovered job gets scored, always with an explanation,
// per the Phase 3 decision that filtering is a separate, query-time
// capability rather than a pre-scoring gate (CLAUDE.md Decisions Log).
export class ScoringPipeline {
  private readonly jobs: JobsRepository;
  private readonly companies: CompaniesRepository;
  private readonly people: PeopleRepository;
  private readonly candidateProfile: CandidateProfileRepository;

  constructor(db: DatabaseSync) {
    this.jobs = new JobsRepository(db);
    this.companies = new CompaniesRepository(db);
    this.people = new PeopleRepository(db);
    this.candidateProfile = new CandidateProfileRepository(db);
  }

  run(): ScoringSummary {
    const profile = this.candidateProfile.get();
    const unscored = this.jobs.findByFilters({ status: "new" });

    for (const job of unscored) {
      this.scoreAndPersist(job, profile);
    }

    logger.info("Scoring pass complete", { scored: unscored.length });
    return { scored: unscored.length };
  }

  // On-demand re-score of a single job, regardless of its current status
  // (Phase 7's score_job MCP tool). Reuses the same scoreJob() math as
  // run() — no new scoring logic, just a new entry point.
  //
  // Deliberately does NOT force status back to 'reviewed' the way run()
  // does for first-time scoring: a job already at 'applied' or
  // 'interviewing' reflects real pipeline progress (Phase 6's
  // Application-status sync), and re-scoring it — e.g. after Faisal tunes
  // his preferences — must never regress that. Status only advances here
  // if the job was still sitting at 'new'.
  scoreOne(jobId: number): Job {
    const job = this.jobs.findById(jobId);
    if (!job) throw new NotFoundError("Job", jobId);

    const profile = this.candidateProfile.get();
    return this.scoreAndPersist(job, profile);
  }

  private scoreAndPersist(job: Job, profile: CandidateProfile): Job {
    const company = job.company_id !== null ? this.companies.findById(job.company_id) : null;
    const people = job.company_id !== null ? this.people.findByCompany(job.company_id) : [];
    const result = scoreJob(job, company, people, profile);

    // Matches CLAUDE.md's stated status flow: new -> reviewed -> qualified -> ...
    // Scoring only ever moves a job from 'new' to 'reviewed' — deciding
    // it's 'qualified' (or 'skipped') is a human/Claude judgment call on
    // top of the score, not something scoring itself decides. A job past
    // 'new' (e.g. 'applied', 'interviewing' via Phase 6's Application-status
    // sync) already reflects real progress and must never be reset by a
    // re-score — including via score_job (Phase 7), the only other caller.
    const shouldAdvanceStatus = job.status === "new";

    return this.jobs.update(job.id, {
      fit_score: result.score,
      fit_category: result.category,
      fit_explanation: result.explanation,
      ...(shouldAdvanceStatus ? { status: "reviewed" as const } : {}),
    });
  }
}

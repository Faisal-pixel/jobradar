import type { DatabaseSync } from "node:sqlite";
import { JobsRepository } from "../../database/repositories/jobs-repository.js";
import { CompaniesRepository } from "../../database/repositories/companies-repository.js";
import { PeopleRepository } from "../../database/repositories/people-repository.js";
import { CandidateProfileRepository } from "../../database/repositories/candidate-profile-repository.js";
import { scoreJob } from "./fit-scorer.js";
import { logger } from "../../shared/logger.js";

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
      const company = job.company_id !== null ? this.companies.findById(job.company_id) : null;
      const people = job.company_id !== null ? this.people.findByCompany(job.company_id) : [];
      const result = scoreJob(job, company, people, profile);

      // Matches CLAUDE.md's stated status flow: new -> reviewed -> qualified -> ...
      // Scoring only ever moves a job to 'reviewed' — deciding it's
      // 'qualified' (or 'skipped') is a human/Claude judgment call on
      // top of the score, not something scoring itself decides.
      this.jobs.update(job.id, {
        fit_score: result.score,
        fit_category: result.category,
        fit_explanation: result.explanation,
        status: "reviewed",
      });
    }

    logger.info("Scoring pass complete", { scored: unscored.length });
    return { scored: unscored.length };
  }
}

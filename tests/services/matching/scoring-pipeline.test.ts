import { describe, it, expect, beforeEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../../test-helpers/create-test-db.js";
import { ScoringPipeline } from "../../../src/services/matching/scoring-pipeline.js";
import { JobsRepository } from "../../../src/database/repositories/jobs-repository.js";
import { CompaniesRepository } from "../../../src/database/repositories/companies-repository.js";

describe("ScoringPipeline", () => {
  let db: DatabaseSync;
  let jobs: JobsRepository;
  let companies: CompaniesRepository;

  beforeEach(() => {
    db = createTestDb();
    jobs = new JobsRepository(db);
    companies = new CompaniesRepository(db);
  });

  it("scores every status='new' job, writes fit fields back, and moves it to 'reviewed'", () => {
    const company = companies.create({ name: "Acme", team_size: 10 });
    jobs.create({ title: "Backend Engineer", source: "workatastartup", source_job_id: "1", company_id: company.id });
    jobs.create({ title: "Backend Engineer", source: "workatastartup", source_job_id: "2", company_id: company.id });

    const pipeline = new ScoringPipeline(db);
    const summary = pipeline.run();

    expect(summary.scored).toBe(2);
    for (const job of jobs.list()) {
      expect(job.status).toBe("reviewed");
      expect(job.fit_score).not.toBeNull();
      expect(job.fit_category).not.toBeNull();
      expect(job.fit_explanation).toContain("Technical Fit:");
      expect(job.fit_explanation).toContain("Founder Accessibility:");
    }
  });

  it("does not re-score already-reviewed jobs on a second run", () => {
    companies.create({ name: "Acme" });
    jobs.create({ title: "Backend Engineer", source: "workatastartup", source_job_id: "1" });

    const pipeline = new ScoringPipeline(db);
    pipeline.run();
    const firstExplanation = jobs.list()[0]?.fit_explanation;

    const second = pipeline.run();
    expect(second.scored).toBe(0);
    expect(jobs.list()[0]?.fit_explanation).toBe(firstExplanation);
  });

  it("scores a job with no company (company_id null) without crashing", () => {
    jobs.create({ title: "Backend Engineer", source: "workatastartup", source_job_id: "1" });

    const pipeline = new ScoringPipeline(db);
    const summary = pipeline.run();

    expect(summary.scored).toBe(1);
    expect(jobs.list()[0]?.fit_score).not.toBeNull();
  });
});

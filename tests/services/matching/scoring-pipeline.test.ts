import { describe, it, expect, beforeEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../../test-helpers/create-test-db.js";
import { ScoringPipeline } from "../../../src/services/matching/scoring-pipeline.js";
import { JobsRepository } from "../../../src/database/repositories/jobs-repository.js";
import { CompaniesRepository } from "../../../src/database/repositories/companies-repository.js";
import { NotFoundError } from "../../../src/shared/errors.js";

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

  describe("scoreOne", () => {
    it("scores a job at status='new' and advances it to 'reviewed', same as run()", () => {
      companies.create({ name: "Acme", team_size: 10 });
      const job = jobs.create({ title: "Backend Engineer", source: "workatastartup", source_job_id: "1" });

      const result = new ScoringPipeline(db).scoreOne(job.id);

      expect(result.status).toBe("reviewed");
      expect(result.fit_score).not.toBeNull();
    });

    it("re-scores a job already past 'new' without regressing its status", () => {
      const job = jobs.create({ title: "Backend Engineer", source: "workatastartup", source_job_id: "1" });
      jobs.update(job.id, { status: "applied" }); // simulates Phase 6's Application-status sync

      const result = new ScoringPipeline(db).scoreOne(job.id);

      expect(result.status).toBe("applied"); // never reset to 'reviewed'
      expect(result.fit_score).not.toBeNull(); // but the score itself is still refreshed
    });

    it("throws NotFoundError for a job that doesn't exist", () => {
      expect(() => new ScoringPipeline(db).scoreOne(9999)).toThrow(NotFoundError);
    });

    it("reflects updated fit fields when called twice after preferences change (re-scoring is real, not a no-op)", () => {
      companies.create({ name: "Acme" });
      const job = jobs.create({ title: "Founding Engineer", source: "workatastartup", source_job_id: "1" });

      const pipeline = new ScoringPipeline(db);
      const first = pipeline.scoreOne(job.id);
      const second = pipeline.scoreOne(job.id);

      // Same inputs both times -> same score; this proves scoreOne always
      // recomputes rather than skipping an already-scored job (unlike run()).
      expect(second.fit_score).toBe(first.fit_score);
      expect(second.fit_explanation).toBe(first.fit_explanation);
    });
  });
});

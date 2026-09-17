import { describe, it, expect, beforeEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../../test-helpers/create-test-db.js";
import { JobsRepository } from "../../../src/database/repositories/jobs-repository.js";

describe("JobsRepository", () => {
  let db: DatabaseSync;
  let repo: JobsRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new JobsRepository(db);
  });

  it("creates a job with a default status and round-trips the remote boolean", () => {
    const job = repo.create({
      title: "Founding Engineer",
      source: "ycombinator",
      source_job_id: "yc-123",
      remote: true,
    });
    expect(job.status).toBe("new");
    expect(job.remote).toBe(true);
  });

  it("stores remote: false distinctly from remote: null", () => {
    const notRemote = repo.create({ title: "A", source: "yc", source_job_id: "1", remote: false });
    const unknown = repo.create({ title: "B", source: "yc", source_job_id: "2" });
    expect(notRemote.remote).toBe(false);
    expect(unknown.remote).toBeNull();
  });

  it("enforces the source + source_job_id dedup constraint", () => {
    repo.create({ title: "A", source: "ycombinator", source_job_id: "dup-1" });
    expect(() => repo.create({ title: "B", source: "ycombinator", source_job_id: "dup-1" })).toThrow();
  });

  it("allows the same source_job_id across different sources", () => {
    repo.create({ title: "A", source: "ycombinator", source_job_id: "1" });
    expect(() =>
      repo.create({ title: "B", source: "workatastartup", source_job_id: "1" }),
    ).not.toThrow();
  });

  it("finds a job by source + source_job_id", () => {
    const created = repo.create({ title: "A", source: "ycombinator", source_job_id: "42" });
    expect(repo.findBySource("ycombinator", "42")).toEqual(created);
    expect(repo.findBySource("ycombinator", "missing")).toBeNull();
  });

  it("rejects an invalid status via the CHECK constraint", () => {
    expect(() =>
      repo.create({
        title: "A",
        source: "yc",
        source_job_id: "1",
        // @ts-expect-error deliberately invalid to test the DB-level CHECK constraint
        status: "not_a_real_status",
      }),
    ).toThrow();
  });

  describe("findByFilters", () => {
    beforeEach(() => {
      repo.create({ title: "A", source: "yc", source_job_id: "1", status: "new", remote: true, fit_score: 90, fit_category: "A" });
      repo.create({ title: "B", source: "yc", source_job_id: "2", status: "reviewed", remote: false, fit_score: 50, fit_category: "skip" });
      repo.create({ title: "C", source: "yc", source_job_id: "3", status: "reviewed", remote: true, fit_score: 70, fit_category: "B" });
    });

    it("filters by status", () => {
      expect(repo.findByFilters({ status: "reviewed" })).toHaveLength(2);
    });

    it("filters by fitCategory", () => {
      expect(repo.findByFilters({ fitCategory: "B" }).map((j) => j.title)).toEqual(["C"]);
    });

    it("filters by minFitScore", () => {
      expect(repo.findByFilters({ minFitScore: 70 }).map((j) => j.title).sort()).toEqual(["A", "C"]);
    });

    it("filters by remoteOnly", () => {
      expect(repo.findByFilters({ remoteOnly: true }).map((j) => j.title).sort()).toEqual(["A", "C"]);
    });

    it("combines filters with AND semantics", () => {
      expect(repo.findByFilters({ status: "reviewed", remoteOnly: true }).map((j) => j.title)).toEqual(["C"]);
    });

    it("returns everything, ordered by fit_score desc, when no filters are given", () => {
      expect(repo.findByFilters({}).map((j) => j.title)).toEqual(["A", "C", "B"]);
    });
  });
});

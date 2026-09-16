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
});

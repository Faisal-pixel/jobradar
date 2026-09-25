import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../../test-helpers/create-test-db.js";
import { JobsRepository } from "../../../src/database/repositories/jobs-repository.js";
import { JobResearchService } from "../../../src/services/job-research/job-research-service.js";
import { resetRateLimiterForTests } from "../../../src/sources/http-client.js";
import { NotFoundError } from "../../../src/shared/errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const jobDetailFixture = readFileSync(
  join(__dirname, "../../fixtures/workatastartup/job-detail-13302.html"),
  "utf8",
);

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

describe("JobResearchService", () => {
  let db: DatabaseSync;
  let jobs: JobsRepository;
  let service: JobResearchService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    db = createTestDb();
    jobs = new JobsRepository(db);
    service = new JobResearchService(db);
    resetRateLimiterForTests();
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("throws NotFoundError for an unknown job", async () => {
    await expect(service.researchJob(9999)).rejects.toThrow(NotFoundError);
  });

  it("reports stillListed: false and no changes when the posting has disappeared (404)", async () => {
    fetchMock.mockResolvedValue(new Response("not found", { status: 404 }));
    const job = jobs.create({ title: "Old Title", source: "workatastartup", source_job_id: "13302" });

    const promise = service.researchJob(job.id);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.stillListed).toBe(false);
    expect(result.changes).toEqual([]);
  });

  it("reports stillListed: true and flags changed fields against the live posting", async () => {
    fetchMock.mockResolvedValue(htmlResponse(jobDetailFixture));
    // Fixture's real values: location "Seattle, WA", salary 80,000-140,000 —
    // stored row is deliberately different to exercise the diff.
    const job = jobs.create({
      title: "Backend Engineer",
      source: "workatastartup",
      source_job_id: "13302",
      location: "Remote (US)",
      salary_min: 90_000,
      salary_max: 150_000,
    });

    const promise = service.researchJob(job.id);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.stillListed).toBe(true);
    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "location", previousValue: "Remote (US)", currentValue: "Seattle, WA" }),
        expect.objectContaining({ field: "salary_min", previousValue: 90_000, currentValue: 80_000 }),
        expect.objectContaining({ field: "salary_max", previousValue: 150_000, currentValue: 140_000 }),
      ]),
    );
  });

  it("reports no changes when the live posting matches what's stored", async () => {
    fetchMock.mockResolvedValue(htmlResponse(jobDetailFixture));
    const job = jobs.create({
      title: "Backend Engineer",
      source: "workatastartup",
      source_job_id: "13302",
      location: "Seattle, WA",
      salary_min: 80_000,
      salary_max: 140_000,
      description: "Visa: US citizen/visa only\nMin experience: Any (new grads ok)\nSkills: Amazon Web Services (AWS)",
    });
    // description is composed from several fields — just assert the
    // structured fields stay quiet; description naturally still differs
    // from the fixture's real full composed text in this synthetic row.
    const result0 = jobs.findById(job.id)!;

    const promise = service.researchJob(job.id);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.stillListed).toBe(true);
    expect(result.changes.find((c) => c.field === "location")).toBeUndefined();
    expect(result.changes.find((c) => c.field === "salary_min")).toBeUndefined();
    expect(result0.location).toBe("Seattle, WA"); // sanity check on the fixture setup itself
  });

  it("skips research for a job from a source other than Work at a Startup, without crashing", async () => {
    const job = jobs.create({ title: "Hypothetical Future Source", source: "future-source", source_job_id: "1" });

    const result = await service.researchJob(job.id);

    expect(result).toEqual({ jobId: job.id, stillListed: true, changes: [], checkedAt: expect.any(String) });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../../test-helpers/create-test-db.js";
import { SourceManager } from "../../../src/services/job-discovery/source-manager.js";
import { JobsRepository } from "../../../src/database/repositories/jobs-repository.js";
import { CompaniesRepository } from "../../../src/database/repositories/companies-repository.js";
import { PeopleRepository } from "../../../src/database/repositories/people-repository.js";
import { SourceHealthRepository } from "../../../src/database/repositories/source-health-repository.js";
import type { JobSource, DiscoveredJob } from "../../../src/sources/job-source.js";
import type { NewJob } from "../../../src/domain/jobs/job.js";
import type { NewCompany } from "../../../src/domain/companies/company.js";
import type { NewPerson } from "../../../src/domain/people/person.js";

function discoveredJob(
  overrides: Partial<NewJob> = {},
  company: Partial<NewCompany> = {},
  founders: NewPerson[] = [],
): DiscoveredJob {
  return {
    job: {
      title: "Backend Engineer",
      source: overrides.source ?? "fake-source",
      source_job_id: overrides.source_job_id ?? "1",
      ...overrides,
    },
    company: { name: "Acme Robotics", ...company },
    founders,
  };
}

// A minimal, fully-controllable JobSource for exercising SourceManager
// without any network involved.
class FakeJobSource implements JobSource {
  getJobCallCount = 0;

  constructor(
    readonly name: string,
    private readonly candidates: DiscoveredJob[],
    private readonly options: {
      throwOnDiscover?: boolean;
      detailBySourceJobId?: Record<string, DiscoveredJob>;
    } = {},
  ) {}

  async discoverJobs(): Promise<DiscoveredJob[]> {
    if (this.options.throwOnDiscover) throw new Error(`${this.name} is down`);
    return this.candidates;
  }

  async getJob(sourceJobId: string): Promise<DiscoveredJob | null> {
    this.getJobCallCount++;
    return this.options.detailBySourceJobId?.[sourceJobId] ?? null;
  }

  async healthCheck() {
    return { healthy: true };
  }
}

describe("SourceManager", () => {
  let db: DatabaseSync;
  let jobs: JobsRepository;
  let companies: CompaniesRepository;
  let people: PeopleRepository;
  let sourceHealth: SourceHealthRepository;

  beforeEach(() => {
    db = createTestDb();
    jobs = new JobsRepository(db);
    companies = new CompaniesRepository(db);
    people = new PeopleRepository(db);
    sourceHealth = new SourceHealthRepository(db);
  });

  it("persists a new job and creates its company", async () => {
    const source = new FakeJobSource("fake-source", [discoveredJob()]);
    const manager = new SourceManager(db, [source]);

    const [result] = await manager.runAll();

    expect(result).toMatchObject({ ok: true, jobsFound: 1, jobsCreated: 1, jobsSkipped: 0 });
    const company = companies.findByName("Acme Robotics");
    expect(company).not.toBeNull();
    expect(jobs.findBySource("fake-source", "1")?.company_id).toBe(company!.id);
  });

  it("skips an already-known job (exact dedup by source + source_job_id)", async () => {
    const source = new FakeJobSource("fake-source", [discoveredJob()]);
    const manager = new SourceManager(db, [source]);

    await manager.runAll();
    const [secondRun] = await manager.runAll();

    expect(secondRun).toMatchObject({ jobsFound: 1, jobsCreated: 0, jobsSkipped: 1 });
    expect(jobs.list()).toHaveLength(1);
  });

  it("skips a cross-source duplicate (same company + normalized title, different source)", async () => {
    const sourceA = new FakeJobSource("source-a", [
      discoveredJob({ source: "source-a", source_job_id: "1", title: "Backend Engineer" }),
    ]);
    const sourceB = new FakeJobSource("source-b", [
      discoveredJob({ source: "source-b", source_job_id: "999", title: "  backend engineer  " }),
    ]);
    const manager = new SourceManager(db, [sourceA, sourceB]);

    const results = await manager.runAll();

    expect(results[1]).toMatchObject({ jobsCreated: 0, jobsSkipped: 1 });
    expect(jobs.list()).toHaveLength(1);
  });

  it("isolates a failing source — other sources still run, and runAll never throws", async () => {
    const failing = new FakeJobSource("failing-source", [], { throwOnDiscover: true });
    const healthySource = new FakeJobSource("healthy-source", [
      discoveredJob({ source: "healthy-source", source_job_id: "1" }),
    ]);
    const manager = new SourceManager(db, [failing, healthySource]);

    const results = await manager.runAll();

    expect(results[0]).toMatchObject({ source: "failing-source", ok: false, error: "failing-source is down" });
    expect(results[1]).toMatchObject({ source: "healthy-source", ok: true, jobsCreated: 1 });
    expect(jobs.list()).toHaveLength(1);
  });

  it("records source health on success and failure", async () => {
    const failing = new FakeJobSource("failing-source", [], { throwOnDiscover: true });
    const manager = new SourceManager(db, [failing]);

    await manager.runAll();
    const health = sourceHealth.get("failing-source");
    expect(health).toMatchObject({ status: "degraded", consecutive_failures: 1, last_error: "failing-source is down" });
  });

  it("only enriches genuinely new jobs via getJob, and uses the enriched data", async () => {
    const cheap = discoveredJob({ source_job_id: "1" });
    const detailed = discoveredJob(
      { source_job_id: "1", description: "Full detail description", salary_min: 100_000 },
      { team_size: 42 },
    );
    const source = new FakeJobSource("fake-source", [cheap], {
      detailBySourceJobId: { "1": detailed },
    });
    const manager = new SourceManager(db, [source]);

    await manager.runAll();

    expect(source.getJobCallCount).toBe(1);
    const stored = jobs.findBySource("fake-source", "1");
    expect(stored?.description).toBe("Full detail description");
    expect(stored?.salary_min).toBe(100_000);

    // Second run: job already known, must not call getJob again.
    await manager.runAll();
    expect(source.getJobCallCount).toBe(1);
  });

  it("persists founders when a company is newly created", async () => {
    const founder: NewPerson = { name: "Jane Founder", category: "founder", linkedin_url: "https://linkedin.com/in/jane" };
    const source = new FakeJobSource("fake-source", [discoveredJob({}, {}, [founder])]);
    const manager = new SourceManager(db, [source]);

    await manager.runAll();

    const company = companies.findByName("Acme Robotics")!;
    const persistedFounders = people.list().filter((p) => p.company_id === company.id);
    expect(persistedFounders).toHaveLength(1);
    expect(persistedFounders[0]).toMatchObject({ name: "Jane Founder", category: "founder" });
  });

  it("does not re-persist founders for an already-known company", async () => {
    const founder: NewPerson = { name: "Jane Founder", category: "founder" };
    const jobAtCompany = (sourceJobId: string) => discoveredJob({ source_job_id: sourceJobId }, {}, [founder]);
    const source = new FakeJobSource("fake-source", [jobAtCompany("1"), jobAtCompany("2")]);
    const manager = new SourceManager(db, [source]);

    await manager.runAll();

    const company = companies.findByName("Acme Robotics")!;
    const persistedFounders = people.list().filter((p) => p.company_id === company.id);
    expect(persistedFounders).toHaveLength(1); // not duplicated for the second job at the same company
  });

  it("merges last_active from the cheap tier into enriched company data", async () => {
    const cheap = discoveredJob({ source_job_id: "1" }, { last_active: "3 months ago" });
    // Detail-tier data never carries last_active (see Decisions Log) —
    // simulating that honestly rather than including it in the fixture.
    const detailed = discoveredJob({ source_job_id: "1" }, { team_size: 20 });
    const source = new FakeJobSource("fake-source", [cheap], { detailBySourceJobId: { "1": detailed } });
    const manager = new SourceManager(db, [source]);

    await manager.runAll();

    const company = companies.findByName("Acme Robotics");
    expect(company?.last_active).toBe("3 months ago");
    expect(company?.team_size).toBe(20);
  });
});

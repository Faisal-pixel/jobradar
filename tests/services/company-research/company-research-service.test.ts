import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../../test-helpers/create-test-db.js";
import { CompaniesRepository } from "../../../src/database/repositories/companies-repository.js";
import { JobsRepository } from "../../../src/database/repositories/jobs-repository.js";
import { CompanyResearchService } from "../../../src/services/company-research/company-research-service.js";
import { resetRateLimiterForTests } from "../../../src/sources/http-client.js";
import { NotFoundError } from "../../../src/shared/errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const jobDetailFixture = readFileSync(
  join(__dirname, "../../fixtures/workatastartup/job-detail-13302.html"),
  "utf8",
);
const adamYcFixture = readFileSync(join(__dirname, "../../fixtures/ycombinator/company-page-adam.html"), "utf8");
const masonYcFixture = readFileSync(join(__dirname, "../../fixtures/ycombinator/company-page-mason.html"), "utf8");
const adamReposFixture = readFileSync(join(__dirname, "../../fixtures/github/adam-cad-repos.json"), "utf8");

function routedFetchMock() {
  return vi.fn(async (input: string | URL) => {
    const url = input.toString();
    if (url.includes("workatastartup.com/jobs/")) {
      return new Response(jobDetailFixture, { status: 200, headers: { "content-type": "text/html" } });
    }
    if (url.includes("ycombinator.com/companies/adam")) {
      return new Response(adamYcFixture, { status: 200, headers: { "content-type": "text/html" } });
    }
    if (url.includes("ycombinator.com/companies/mason")) {
      return new Response(masonYcFixture, { status: 200, headers: { "content-type": "text/html" } });
    }
    if (url.includes("ycombinator.com/companies/")) {
      return new Response("not found", { status: 404 });
    }
    if (url.includes("api.github.com/orgs/")) {
      return new Response(adamReposFixture, { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  });
}

describe("CompanyResearchService", () => {
  let db: DatabaseSync;
  let companies: CompaniesRepository;
  let jobs: JobsRepository;
  let service: CompanyResearchService;
  let fetchMock: ReturnType<typeof routedFetchMock>;

  beforeEach(() => {
    db = createTestDb();
    companies = new CompaniesRepository(db);
    jobs = new JobsRepository(db);
    service = new CompanyResearchService(db);
    resetRateLimiterForTests();
    vi.useFakeTimers();
    fetchMock = routedFetchMock();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("throws NotFoundError for an unknown company", async () => {
    await expect(service.researchCompany(9999)).rejects.toThrow(NotFoundError);
  });

  it("returns Work at a Startup fields (stripped of HTML) and Y Combinator fields, each tagged with source", async () => {
    const company = companies.create({ name: "Adam", slug: "adam" });
    jobs.create({ title: "Founding Engineer", source: "workatastartup", source_job_id: "13302", company_id: company.id });

    const promise = service.researchCompany(company.id);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.workAtAStartup.techStack.value).toContain("Android");
    expect(result.workAtAStartup.techStack.source).toBe("self-declared (Work at a Startup)");
    expect(result.workAtAStartup.techStack.value).not.toContain("<p>"); // HTML stripped

    expect(result.ycombinator.linkedinUrl.value).toBe("https://www.linkedin.com/company/adamcad/");
    expect(result.ycombinator.linkedinUrl.source).toBe("self-declared (Y Combinator)");
    expect(result.ycombinator.status.value).toBe("Active");
  });

  it("treats Y Combinator's empty-string 'unset' fields as not provided, never as a found empty value (found live in Phase 9 testing)", async () => {
    const company = companies.create({ name: "Mason", slug: "mason" });
    jobs.create({ title: "Backend Engineer", source: "workatastartup", source_job_id: "13302", company_id: company.id });

    const promise = service.researchCompany(company.id);
    await vi.runAllTimersAsync();
    const result = await promise;

    // Mason's real page has cb_url populated but github_url as "" —
    // github_url must come back null (not ""), with a "not provided"
    // source, and no GitHub follow-up request should ever fire.
    expect(result.ycombinator.crunchbaseUrl.value).toBe("https://www.crunchbase.com/organization/mason");
    expect(result.ycombinator.githubUrl.value).toBeNull();
    expect(result.ycombinator.githubUrl.source).toContain("not provided");
    expect(result.github.signal.value).toBeNull();
    expect(result.github.signal.source).toContain("no GitHub link declared");
    expect(fetchMock.mock.calls.some(([url]) => url.toString().includes("api.github.com"))).toBe(false);
  });

  it("follows a self-declared GitHub link for a tech signal, tagged as GitHub data", async () => {
    const company = companies.create({ name: "Adam", slug: "adam" });
    jobs.create({ title: "Founding Engineer", source: "workatastartup", source_job_id: "13302", company_id: company.id });

    const promise = service.researchCompany(company.id);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.github.signal.value).toEqual([{ repo: "CADAM", language: "TypeScript", stars: 5175 }]);
    expect(result.github.signal.source).toContain("public GitHub data");
  });

  it("reports 'no known job listing' for Work at a Startup fields when the company has no jobs on file", async () => {
    const company = companies.create({ name: "Adam", slug: "adam" });

    const promise = service.researchCompany(company.id);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.workAtAStartup.techStack.value).toBeNull();
    expect(result.workAtAStartup.techStack.source).toContain("no known job listing");
  });

  it("reports 'could not locate' for Y Combinator fields, and 'no GitHub link' for the signal, when the slug guess doesn't resolve", async () => {
    const company = companies.create({ name: "Totally Unknown Startup" }); // no slug on file

    const promise = service.researchCompany(company.id);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ycombinator.linkedinUrl.value).toBeNull();
    expect(result.ycombinator.linkedinUrl.source).toContain("could not locate");
    expect(result.github.signal.value).toBeNull();
    expect(result.github.signal.source).toContain("no GitHub link declared");
  });

  it("backfills companies.slug after a guess resolves to a real Y Combinator page", async () => {
    const company = companies.create({ name: "Adam" }); // no slug persisted yet, guessable to "adam"
    expect(company.slug).toBeNull();

    const promise = service.researchCompany(company.id);
    await vi.runAllTimersAsync();
    await promise;

    expect(companies.findById(company.id)?.slug).toBe("adam");
  });

  it("does not overwrite an already-known slug", async () => {
    const company = companies.create({ name: "Whatever This Is Called", slug: "adam" }); // deliberately mismatched name

    const promise = service.researchCompany(company.id);
    await vi.runAllTimersAsync();
    await promise;

    expect(companies.findById(company.id)?.slug).toBe("adam"); // unchanged, still resolves via the stored slug
    expect(fetchMock.mock.calls.some(([url]) => url.toString().includes("/companies/adam"))).toBe(true);
  });
});

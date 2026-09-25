import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../../test-helpers/create-test-db.js";
import { CompaniesRepository } from "../../../src/database/repositories/companies-repository.js";
import { PeopleRepository } from "../../../src/database/repositories/people-repository.js";
import { PeopleResearchService } from "../../../src/services/people-research/people-research-service.js";
import { resetRateLimiterForTests } from "../../../src/sources/http-client.js";
import { NotFoundError } from "../../../src/shared/errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const adamYcFixture = readFileSync(join(__dirname, "../../fixtures/ycombinator/company-page-adam.html"), "utf8");
const masonYcFixture = readFileSync(join(__dirname, "../../fixtures/ycombinator/company-page-mason.html"), "utf8");

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

describe("PeopleResearchService", () => {
  let db: DatabaseSync;
  let companies: CompaniesRepository;
  let people: PeopleRepository;
  let service: PeopleResearchService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    db = createTestDb();
    companies = new CompaniesRepository(db);
    people = new PeopleRepository(db);
    service = new PeopleResearchService(db);
    resetRateLimiterForTests();
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("throws NotFoundError for an unknown company", async () => {
    await expect(service.researchCompanyPeople(9999)).rejects.toThrow(NotFoundError);
  });

  it("returns founders not fabricated beyond what Y Combinator declares, unmatched against existing people", async () => {
    fetchMock.mockResolvedValue(htmlResponse(adamYcFixture));
    const company = companies.create({ name: "Adam", slug: "adam" });

    const promise = service.researchCompanyPeople(company.id);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.source).toBe("self-declared (Y Combinator)");
    expect(result.founders).toHaveLength(2);
    expect(result.founders[0]).toMatchObject({
      name: "Zach Dive",
      title: "Founder/CEO",
      linkedinUrl: "https://linkedin.com/in/zacharydive",
      matchedExistingPersonId: null, // JobRadar didn't already know this founder
    });
  });

  it("matches an already-known founder (from Work at a Startup's own scrape) by name", async () => {
    fetchMock.mockResolvedValue(htmlResponse(masonYcFixture));
    const company = companies.create({ name: "Mason", slug: "mason" });
    const existing = people.create({ name: "Jim Xiao", category: "founder", company_id: company.id, source: "workatastartup" });

    const promise = service.researchCompanyPeople(company.id);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.founders).toHaveLength(1);
    expect(result.founders[0]).toMatchObject({ name: "Jim Xiao", matchedExistingPersonId: existing.id });
  });

  it("reports 'could not locate' and an empty founders list when the slug doesn't resolve", async () => {
    fetchMock.mockResolvedValue(new Response("not found", { status: 404 }));
    const company = companies.create({ name: "Totally Unknown Startup" });

    const promise = service.researchCompanyPeople(company.id);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.founders).toEqual([]);
    expect(result.source).toContain("could not locate");
  });

  it("does not persist anything it finds — read-only", async () => {
    fetchMock.mockResolvedValue(htmlResponse(adamYcFixture));
    const company = companies.create({ name: "Adam", slug: "adam" });

    const promise = service.researchCompanyPeople(company.id);
    await vi.runAllTimersAsync();
    await promise;

    expect(people.findByCompany(company.id)).toEqual([]); // still empty — nothing was auto-saved
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WorkAtAStartupSource } from "../../../src/sources/workatastartup/index.js";
import { resetRateLimiterForTests } from "../../../src/sources/http-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "../../fixtures/workatastartup");
const searchFixture = readFileSync(join(FIXTURES_DIR, "search-response.json"), "utf8");
const jobDetailFixture = readFileSync(join(FIXTURES_DIR, "job-detail-13302.html"), "utf8");

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}
function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

describe("WorkAtAStartupSource", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetRateLimiterForTests();
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("discoverJobs sends an honest User-Agent and one request per configured query", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(searchFixture));
    const source = new WorkAtAStartupSource();

    const promise = source.discoverJobs();
    await vi.runAllTimersAsync();
    await promise;

    // Default query list has 5 entries (src/config/search-queries.ts).
    expect(fetchMock).toHaveBeenCalledTimes(5);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/^JobRadar\//);
  });

  it("discoverJobs dedupes the same job id seen across multiple search queries", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(searchFixture));
    const source = new WorkAtAStartupSource();

    const promise = source.discoverJobs();
    await vi.runAllTimersAsync();
    const results = await promise;

    // The fixture has 30 jobs; the mock returns the same 30 for every one
    // of the 5 queries, so a correct implementation ends up with 30
    // unique jobs, not 150.
    expect(results).toHaveLength(30);
  });

  it("rate-limits sequential requests to roughly 1/sec", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(searchFixture));
    const source = new WorkAtAStartupSource();

    const promise = source.discoverJobs();
    // Only the first request should have fired before any time passes.
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);

    await vi.runAllTimersAsync();
    await promise;
  });

  it("getJob returns a normalized DiscoveredJob for a real job page", async () => {
    fetchMock.mockResolvedValue(htmlResponse(jobDetailFixture));
    const source = new WorkAtAStartupSource();

    const promise = source.getJob("13302");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result?.job.source_job_id).toBe("13302");
    expect(result?.company.name).toBe("Mason");
  });

  it("getJob returns null on a 404 (job removed or never existed)", async () => {
    fetchMock.mockResolvedValue(new Response("not found", { status: 404 }));
    const source = new WorkAtAStartupSource();

    const promise = source.getJob("999999999");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
  });

  it("getCompanyResearchDetail returns the research-only fields getJob's normalization drops (Phase 9)", async () => {
    fetchMock.mockResolvedValue(htmlResponse(jobDetailFixture));
    const source = new WorkAtAStartupSource();

    const promise = source.getCompanyResearchDetail("13302");
    await vi.runAllTimersAsync();
    const detail = await promise;

    expect(detail?.techDescriptionHtml).toContain("Android");
    expect(detail?.hiringDescriptionHtml).toContain("Mason provides");
    expect(fetchMock).toHaveBeenCalledTimes(1); // same request getJob would make, no extra round-trip
  });

  it("getCompanyResearchDetail returns null on a 404, same as getJob", async () => {
    fetchMock.mockResolvedValue(new Response("not found", { status: 404 }));
    const source = new WorkAtAStartupSource();

    const promise = source.getCompanyResearchDetail("999999999");
    await vi.runAllTimersAsync();
    expect(await promise).toBeNull();
  });

  it("healthCheck reports healthy on a 200 and unhealthy otherwise", async () => {
    const source = new WorkAtAStartupSource();

    fetchMock.mockResolvedValue(jsonResponse(searchFixture));
    let promise = source.healthCheck();
    await vi.runAllTimersAsync();
    expect(await promise).toEqual({ healthy: true });

    fetchMock.mockResolvedValue(new Response("error", { status: 500 }));
    promise = source.healthCheck();
    await vi.runAllTimersAsync();
    expect((await promise).healthy).toBe(false);
  });
});

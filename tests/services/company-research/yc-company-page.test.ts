import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchYcCompanyPage, guessCompanySlug } from "../../../src/services/company-research/yc-company-page.js";
import { resetRateLimiterForTests } from "../../../src/sources/http-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "../../fixtures/ycombinator");
// Real, unmodified captures from ycombinator.com/companies/<slug>, taken
// during Phase 9 investigation (2026-09-24) — not fabricated shapes.
const masonFixture = readFileSync(join(FIXTURES_DIR, "company-page-mason.html"), "utf8");
const adamFixture = readFileSync(join(FIXTURES_DIR, "company-page-adam.html"), "utf8");

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

describe("guessCompanySlug", () => {
  it("lowercases and hyphenates, matching Y Combinator's real convention", () => {
    expect(guessCompanySlug("Adam")).toBe("adam");
    expect(guessCompanySlug("NOSO LABS")).toBe("noso-labs");
    expect(guessCompanySlug("Discovered Materials")).toBe("discovered-materials");
  });
});

describe("fetchYcCompanyPage", () => {
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

  it("parses a real company page with a GitHub link and two founders (Adam)", async () => {
    fetchMock.mockResolvedValue(htmlResponse(adamFixture));

    const promise = fetchYcCompanyPage("adam");
    await vi.runAllTimersAsync();
    const page = await promise;

    expect(page?.slug).toBe("adam");
    expect(page?.linkedin_url).toBe("https://www.linkedin.com/company/adamcad/");
    expect(page?.github_url).toBe("https://github.com/Adam-CAD");
    expect(page?.year_founded).toBe(2025);
    expect(page?.ycdc_status).toBe("Active");
    expect(page?.founders).toHaveLength(2);
    expect(page?.founders?.[0]).toMatchObject({ full_name: "Zach Dive", linkedin_url: "https://linkedin.com/in/zacharydive" });
  });

  it("parses a real company page with a Crunchbase link and no GitHub link (Mason)", async () => {
    fetchMock.mockResolvedValue(htmlResponse(masonFixture));

    const promise = fetchYcCompanyPage("mason");
    await vi.runAllTimersAsync();
    const page = await promise;

    expect(page?.cb_url).toBe("https://www.crunchbase.com/organization/mason");
    expect(page?.github_url).toBe(""); // not declared — empty string, not fabricated
    expect(page?.founders?.[0]).toMatchObject({ full_name: "Jim Xiao", title: "Founder/President" });
  });

  it("returns null on a 404 — a wrong slug guess, not a crash", async () => {
    fetchMock.mockResolvedValue(new Response("not found", { status: 404 }));

    const promise = fetchYcCompanyPage("this-company-does-not-exist");
    await vi.runAllTimersAsync();
    expect(await promise).toBeNull();
  });
});

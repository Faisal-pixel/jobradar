import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractGithubOrg, fetchGithubOrgSignal } from "../../../src/services/company-research/github-signal.js";
import { resetRateLimiterForTests } from "../../../src/sources/http-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Real, unmodified capture from api.github.com, taken during Phase 9
// investigation (2026-09-24) — not fabricated data.
const adamReposFixture = readFileSync(join(__dirname, "../../fixtures/github/adam-cad-repos.json"), "utf8");

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

describe("extractGithubOrg", () => {
  it("extracts the org login from a plain github.com org URL", () => {
    expect(extractGithubOrg("https://github.com/Adam-CAD")).toBe("Adam-CAD");
  });

  it("returns null for a non-GitHub URL", () => {
    expect(extractGithubOrg("https://gitlab.com/Adam-CAD")).toBeNull();
  });

  it("returns null for a malformed URL rather than throwing", () => {
    expect(extractGithubOrg("not a url")).toBeNull();
  });
});

describe("fetchGithubOrgSignal", () => {
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

  it("returns real repo/language/star data for a self-declared org link", async () => {
    fetchMock.mockResolvedValue(jsonResponse(adamReposFixture));

    const promise = fetchGithubOrgSignal("https://github.com/Adam-CAD");
    await vi.runAllTimersAsync();
    const signal = await promise;

    expect(signal).toEqual([{ repo: "CADAM", language: "TypeScript", stars: 5175 }]);
  });

  it("returns null (not a crash) when the org can't be reached or is rate-limited", async () => {
    fetchMock.mockResolvedValue(new Response("rate limited", { status: 403 }));

    const promise = fetchGithubOrgSignal("https://github.com/Adam-CAD");
    await vi.runAllTimersAsync();
    expect(await promise).toBeNull();
  });

  it("returns null without making a request when the URL isn't a GitHub link at all", async () => {
    const result = await fetchGithubOrgSignal("https://twitter.com/adamdotnew");
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("excludes forks from the signal", async () => {
    const withFork = JSON.stringify([
      { name: "CADAM", language: "TypeScript", stargazers_count: 5175, fork: false },
      { name: "some-fork", language: "Python", stargazers_count: 2, fork: true },
    ]);
    fetchMock.mockResolvedValue(jsonResponse(withFork));

    const promise = fetchGithubOrgSignal("https://github.com/Adam-CAD");
    await vi.runAllTimersAsync();
    const signal = await promise;

    expect(signal).toEqual([{ repo: "CADAM", language: "TypeScript", stars: 5175 }]);
  });
});

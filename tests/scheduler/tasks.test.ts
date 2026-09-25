import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../test-helpers/create-test-db.js";
import { resetRateLimiterForTests } from "../../src/sources/http-client.js";
import { CompaniesRepository } from "../../src/database/repositories/companies-repository.js";
import { JobsRepository } from "../../src/database/repositories/jobs-repository.js";
import { OutreachRepository } from "../../src/database/repositories/outreach-repository.js";

// Controls Telegram/Sheets configuration deterministically for these
// tests, independent of whatever's in the developer's local .env — a
// mutable object so each test can toggle it without re-mocking.
vi.mock("../../src/config/env.js", () => ({ env: {} as Record<string, unknown> }));

const { env } = await import("../../src/config/env.js");
const { runDiscoveryCycle, runDailyDigest, runWeeklyReport } = await import("../../src/scheduler/tasks.js");

const __dirname = dirname(fileURLToPath(import.meta.url));
const searchFixture = readFileSync(join(__dirname, "../fixtures/workatastartup/search-response.json"), "utf8");

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

function resetEnv(): void {
  Object.keys(env).forEach((key) => delete (env as Record<string, unknown>)[key]);
  // Matches env.ts's real defaults — a bare {} makes loadClientCredentials
  // call fs.existsSync(undefined) instead of hitting a real "not found".
  Object.assign(env, {
    GOOGLE_OAUTH_CLIENT_PATH: "./credentials/google-client.json",
    GOOGLE_OAUTH_TOKEN_PATH: "./credentials/google-token.json",
  });
}

describe("scheduler tasks", () => {
  let db: DatabaseSync;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    db = createTestDb();
    resetEnv();
    resetRateLimiterForTests();
    vi.useFakeTimers();
    fetchMock = vi.fn(async () => jsonResponse(searchFixture));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("runDiscoveryCycle", () => {
    it("runs discovery then scoring, and marks alerts/sync as skipped when unconfigured — status success", async () => {
      const promise = runDiscoveryCycle(db);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.status).toBe("success");
      expect(result.error).toBeNull();
      expect(result.summary.discovery).toBeDefined();
      expect(result.summary.scoring).toBeDefined();
      expect(result.summary.alerts).toEqual({ skipped: "Telegram not configured" });
      expect(result.summary.sheetsSync).toEqual({ skipped: "Google Sheets not configured" });

      // Discovery + scoring actually ran against real repositories, not
      // just returned a placeholder — jobs from the fixture landed and
      // got scored.
      expect(new JobsRepository(db).list().length).toBeGreaterThan(0);
    });

    it("isolates a failing step: an unconfigured-but-set Sheets ID fails only that step, not the whole run", async () => {
      env.GOOGLE_SHEETS_SPREADSHEET_ID = "fake-sheet-id"; // credentials file won't exist in this test env

      const promise = runDiscoveryCycle(db);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.status).toBe("failure"); // sheets sync step genuinely failed
      expect(result.error).toContain("sheetsSync");
      // But discovery/scoring still completed and are reflected in the summary.
      expect(new JobsRepository(db).list().length).toBeGreaterThan(0);
      expect(result.summary.discovery).toBeDefined();
      expect(result.summary.scoring).toBeDefined();
    });
  });

  describe("runDailyDigest", () => {
    it("is a no-op success when Telegram isn't configured — never throws", async () => {
      const result = await runDailyDigest(db);
      expect(result).toEqual({ status: "success", summary: { skipped: "Telegram not configured" }, error: null });
    });

    it("sends one combined message bundling the digest with due follow-ups, not two separate sends", async () => {
      env.TELEGRAM_BOT_TOKEN = "test-token";
      env.TELEGRAM_CHAT_ID = "12345";
      const sentMessages: string[] = [];
      fetchMock.mockImplementation(async (input: string | URL, init?: RequestInit) => {
        const url = input.toString();
        if (url.includes("api.telegram.org")) {
          const body = JSON.parse(String(init?.body));
          sentMessages.push(body.text);
          return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
        }
        return jsonResponse(searchFixture);
      });

      const companies = new CompaniesRepository(db);
      const jobs = new JobsRepository(db);
      const outreach = new OutreachRepository(db);
      const company = companies.create({ name: "Acme" });
      jobs.create({
        title: "Backend Engineer",
        source: "yc",
        source_job_id: "1",
        company_id: company.id,
        fit_category: "A",
        date_found: new Date().toISOString(),
      });
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      outreach.create({ company_id: company.id, status: "contacted", follow_up_date: yesterday });

      const result = await runDailyDigest(db);

      expect(result.status).toBe("success");
      expect(result.summary).toEqual({ jobCount: 1, followUpsDue: 1 });
      expect(sentMessages).toHaveLength(1); // exactly one Telegram send
      expect(sentMessages[0]).toContain("Backend Engineer @ Acme");
      expect(sentMessages[0]).toContain("Follow-ups due (1):");
      expect(sentMessages[0]).toContain("Acme");
    });
  });

  describe("runWeeklyReport", () => {
    it("is a no-op success when Telegram isn't configured — never throws", async () => {
      const result = await runWeeklyReport(db);
      expect(result).toEqual({ status: "success", summary: { skipped: "Telegram not configured" }, error: null });
    });

    it("sends the weekly report when Telegram is configured", async () => {
      env.TELEGRAM_BOT_TOKEN = "test-token";
      env.TELEGRAM_CHAT_ID = "12345";
      const sentMessages: string[] = [];
      fetchMock.mockImplementation(async (input: string | URL, init?: RequestInit) => {
        const url = input.toString();
        if (url.includes("api.telegram.org")) {
          const body = JSON.parse(String(init?.body));
          sentMessages.push(body.text);
          return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
        }
        return jsonResponse(searchFixture);
      });

      const result = await runWeeklyReport(db);

      expect(result.status).toBe("success");
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]).toContain("JobRadar Weekly Report");
    });
  });
});

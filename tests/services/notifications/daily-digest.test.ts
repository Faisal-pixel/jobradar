import { describe, it, expect, beforeEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../../test-helpers/create-test-db.js";
import { DailyDigestService } from "../../../src/services/notifications/daily-digest.js";
import { JobsRepository } from "../../../src/database/repositories/jobs-repository.js";
import { CompaniesRepository } from "../../../src/database/repositories/companies-repository.js";
import type { TelegramClient } from "../../../src/services/notifications/telegram-client.js";

class FakeTelegramClient implements TelegramClient {
  sentMessages: string[] = [];
  async sendMessage(text: string): Promise<void> {
    this.sentMessages.push(text);
  }
}

describe("DailyDigestService", () => {
  let db: DatabaseSync;
  let jobs: JobsRepository;
  let companies: CompaniesRepository;
  let telegram: FakeTelegramClient;

  beforeEach(() => {
    db = createTestDb();
    jobs = new JobsRepository(db);
    companies = new CompaniesRepository(db);
    telegram = new FakeTelegramClient();
  });

  it("sends exactly one digest message summarizing recent jobs", async () => {
    const company = companies.create({ name: "Acme" });
    jobs.create({
      title: "Backend Engineer",
      source: "yc",
      source_job_id: "1",
      company_id: company.id,
      fit_category: "A",
      fit_score: 90,
      date_found: new Date().toISOString(),
    });

    const result = await new DailyDigestService(db, telegram).run();

    expect(result).toEqual({ jobCount: 1 });
    expect(telegram.sentMessages).toHaveLength(1);
    expect(telegram.sentMessages[0]).toContain("Backend Engineer @ Acme");
  });

  it("excludes jobs discovered outside the 24h lookback window", async () => {
    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    jobs.create({ title: "Old Job", source: "yc", source_job_id: "1", date_found: oldDate });

    const result = await new DailyDigestService(db, telegram).run();

    expect(result).toEqual({ jobCount: 0 });
    expect(telegram.sentMessages).toHaveLength(1); // still sends a "0 new jobs" digest
    expect(telegram.sentMessages[0]).toContain("0 new jobs");
  });

  it("always sends exactly one message even with zero jobs (stateless, no dedup tracking)", async () => {
    await new DailyDigestService(db, telegram).run();
    await new DailyDigestService(db, telegram).run();
    expect(telegram.sentMessages).toHaveLength(2); // re-running is harmless, not de-duplicated
  });

  it("buildMessage generates content without sending — Phase 10's scheduler bundles it with follow-ups instead", async () => {
    const company = companies.create({ name: "Acme" });
    jobs.create({
      title: "Backend Engineer",
      source: "yc",
      source_job_id: "1",
      company_id: company.id,
      fit_category: "A",
      fit_score: 90,
      date_found: new Date().toISOString(),
    });

    const { message, jobCount } = await new DailyDigestService(db, telegram).buildMessage();

    expect(jobCount).toBe(1);
    expect(message).toContain("Backend Engineer @ Acme");
    expect(telegram.sentMessages).toHaveLength(0); // nothing sent
  });
});

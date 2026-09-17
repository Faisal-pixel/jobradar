import { describe, it, expect, beforeEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../../test-helpers/create-test-db.js";
import { JobAlertsService } from "../../../src/services/notifications/job-alerts.js";
import { JobsRepository } from "../../../src/database/repositories/jobs-repository.js";
import { CompaniesRepository } from "../../../src/database/repositories/companies-repository.js";
import type { TelegramClient } from "../../../src/services/notifications/telegram-client.js";

class FakeTelegramClient implements TelegramClient {
  sentMessages: string[] = [];
  failNext = false;

  async sendMessage(text: string): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("simulated send failure");
    }
    this.sentMessages.push(text);
  }
}

describe("JobAlertsService", () => {
  let db: DatabaseSync;
  let jobs: JobsRepository;
  let telegram: FakeTelegramClient;

  beforeEach(() => {
    db = createTestDb();
    jobs = new JobsRepository(db);
    const companies = new CompaniesRepository(db);
    companies.create({ name: "Acme" }); // first row in a fresh DB, so id=1 — used by company_id: 1 below
    telegram = new FakeTelegramClient();
  });

  it("sends an alert for each unalerted Category A job and marks it alerted", async () => {
    jobs.create({ title: "A", source: "yc", source_job_id: "1", company_id: 1, fit_category: "A", fit_score: 90 });
    jobs.create({ title: "B", source: "yc", source_job_id: "2", company_id: 1, fit_category: "B", fit_score: 70 });

    const result = await new JobAlertsService(db, telegram).run();

    expect(result).toEqual({ candidates: 1, sent: 1, failed: 0 });
    expect(telegram.sentMessages).toHaveLength(1);
    expect(telegram.sentMessages[0]).toContain("A");
    expect(jobs.findBySource("yc", "1")?.alerted_at).not.toBeNull();
    expect(jobs.findBySource("yc", "2")?.alerted_at).toBeNull(); // B never alerted
  });

  it("does not re-alert an already-alerted job on a second run", async () => {
    jobs.create({ title: "A", source: "yc", source_job_id: "1", fit_category: "A", fit_score: 90 });

    await new JobAlertsService(db, telegram).run();
    const second = await new JobAlertsService(db, telegram).run();

    expect(second).toEqual({ candidates: 0, sent: 0, failed: 0 });
    expect(telegram.sentMessages).toHaveLength(1);
  });

  it("sends nothing and reports zero when there are no Category A jobs", async () => {
    jobs.create({ title: "B", source: "yc", source_job_id: "1", fit_category: "B", fit_score: 70 });
    const result = await new JobAlertsService(db, telegram).run();
    expect(result).toEqual({ candidates: 0, sent: 0, failed: 0 });
    expect(telegram.sentMessages).toHaveLength(0);
  });

  it("counts a failed send without stopping the rest, and does not mark it alerted", async () => {
    jobs.create({ title: "A1", source: "yc", source_job_id: "1", fit_category: "A", fit_score: 90 });
    jobs.create({ title: "A2", source: "yc", source_job_id: "2", fit_category: "A", fit_score: 85 });
    telegram.failNext = true;

    const result = await new JobAlertsService(db, telegram).run();

    expect(result.sent + result.failed).toBe(2);
    expect(result.failed).toBe(1);
    const failedOne = jobs.list().find((j) => j.alerted_at === null);
    expect(failedOne).toBeDefined();
  });
});

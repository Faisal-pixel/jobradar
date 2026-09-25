import { describe, it, expect, beforeEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../../test-helpers/create-test-db.js";
import { WeeklyReportService } from "../../../src/services/notifications/weekly-report.js";
import { JobsRepository } from "../../../src/database/repositories/jobs-repository.js";
import { CompaniesRepository } from "../../../src/database/repositories/companies-repository.js";
import { ApplicationsRepository } from "../../../src/database/repositories/applications-repository.js";
import { OutreachRepository } from "../../../src/database/repositories/outreach-repository.js";
import type { TelegramClient } from "../../../src/services/notifications/telegram-client.js";

class FakeTelegramClient implements TelegramClient {
  sentMessages: string[] = [];
  async sendMessage(text: string): Promise<void> {
    this.sentMessages.push(text);
  }
}

const DAYS_8_AGO = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

describe("WeeklyReportService", () => {
  let db: DatabaseSync;
  let jobs: JobsRepository;
  let companies: CompaniesRepository;
  let applications: ApplicationsRepository;
  let outreach: OutreachRepository;
  let telegram: FakeTelegramClient;

  beforeEach(() => {
    db = createTestDb();
    jobs = new JobsRepository(db);
    companies = new CompaniesRepository(db);
    applications = new ApplicationsRepository(db);
    outreach = new OutreachRepository(db);
    telegram = new FakeTelegramClient();
  });

  it("sends exactly one message summarizing the last 7 days, with nothing fabricated for an empty week", async () => {
    const result = await new WeeklyReportService(db, telegram).run();

    expect(result).toEqual({
      jobsDiscovered: 0,
      newApplications: 0,
      applicationsWithActivity: 0,
      newOutreach: 0,
      overdueFollowUps: 0,
    });
    expect(telegram.sentMessages).toHaveLength(1);
    expect(telegram.sentMessages[0]).toContain("no outreach contacted yet");
  });

  it("counts jobs discovered this week, by fit category, excluding older ones", async () => {
    const company = companies.create({ name: "Acme" });
    jobs.create({ title: "A", source: "yc", source_job_id: "1", company_id: company.id, fit_category: "A", date_found: new Date().toISOString() });
    jobs.create({ title: "B", source: "yc", source_job_id: "2", company_id: company.id, fit_category: "B", date_found: new Date().toISOString() });
    jobs.create({ title: "Old", source: "yc", source_job_id: "3", fit_category: "A", date_found: DAYS_8_AGO });

    const { summary } = await new WeeklyReportService(db, telegram).buildMessage();

    expect(summary.jobsDiscovered).toBe(2);
  });

  it("reports new applications and applications with activity as separate, honest counts (no status-history)", async () => {
    const company = companies.create({ name: "Acme" });
    const job = jobs.create({ title: "A", source: "yc", source_job_id: "1", company_id: company.id });
    applications.create({ job_id: job.id, company_id: company.id, status: "planned" });

    const { summary, message } = await new WeeklyReportService(db, telegram).buildMessage();

    expect(summary.newApplications).toBe(1);
    expect(summary.applicationsWithActivity).toBe(1); // create() also bumps updated_at
    expect(message).toContain("currently: 1 planned");
  });

  it("computes an approximate lifetime response rate from ever-contacted outreach, not a weekly-scoped one", async () => {
    const company = companies.create({ name: "Acme" });
    outreach.create({ company_id: company.id, status: "contacted" });
    outreach.create({ company_id: company.id, status: "responded" });
    outreach.create({ company_id: company.id, status: "draft" }); // never contacted — excluded

    const { message } = await new WeeklyReportService(db, telegram).buildMessage();

    expect(message).toContain("Response rate: 1/2 ever contacted have responded (50%)");
  });

  it("reports outreach still overdue as of report time", async () => {
    const company = companies.create({ name: "Acme" });
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    outreach.create({ company_id: company.id, status: "contacted", follow_up_date: yesterday });

    const { summary } = await new WeeklyReportService(db, telegram).buildMessage();

    expect(summary.overdueFollowUps).toBe(1);
  });

  it("buildMessage does not send — read-only, matching the other Phase 10 services", async () => {
    await new WeeklyReportService(db, telegram).buildMessage();
    expect(telegram.sentMessages).toHaveLength(0);
  });
});

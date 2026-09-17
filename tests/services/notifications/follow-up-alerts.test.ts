import { describe, it, expect, beforeEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../../test-helpers/create-test-db.js";
import { FollowUpAlertsService } from "../../../src/services/notifications/follow-up-alerts.js";
import { OutreachRepository } from "../../../src/database/repositories/outreach-repository.js";
import { CompaniesRepository } from "../../../src/database/repositories/companies-repository.js";
import type { TelegramClient } from "../../../src/services/notifications/telegram-client.js";

class FakeTelegramClient implements TelegramClient {
  sentMessages: string[] = [];
  async sendMessage(text: string): Promise<void> {
    this.sentMessages.push(text);
  }
}

describe("FollowUpAlertsService", () => {
  let db: DatabaseSync;
  let outreach: OutreachRepository;
  let companies: CompaniesRepository;
  let telegram: FakeTelegramClient;

  beforeEach(() => {
    db = createTestDb();
    outreach = new OutreachRepository(db);
    companies = new CompaniesRepository(db);
    telegram = new FakeTelegramClient();
  });

  // The real, current state of this project: Outreach is empty until
  // Phase 6 exists. This must behave correctly with zero rows, not with
  // fabricated test data standing in for real follow-ups.
  it("handles a genuinely empty Outreach table gracefully — no crash, no message sent", async () => {
    expect(outreach.list()).toHaveLength(0);

    const result = await new FollowUpAlertsService(db, telegram).run();

    expect(result).toEqual({ due: 0, sent: 0, failed: 0 });
    expect(telegram.sentMessages).toHaveLength(0);
  });

  it("sends an alert for a due, still-open follow-up", async () => {
    const company = companies.create({ name: "Acme" });
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    outreach.create({ company_id: company.id, status: "contacted", follow_up_date: yesterday });

    const result = await new FollowUpAlertsService(db, telegram).run();

    expect(result).toEqual({ due: 1, sent: 1, failed: 0 });
    expect(telegram.sentMessages[0]).toContain("Follow-up due: Acme");
  });

  it("excludes a follow-up whose date hasn't arrived yet", async () => {
    const company = companies.create({ name: "Acme" });
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    outreach.create({ company_id: company.id, status: "contacted", follow_up_date: tomorrow });

    const result = await new FollowUpAlertsService(db, telegram).run();
    expect(result).toEqual({ due: 0, sent: 0, failed: 0 });
  });

  it("excludes a follow-up already marked closed or responded", async () => {
    const company = companies.create({ name: "Acme" });
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    outreach.create({ company_id: company.id, status: "closed", follow_up_date: yesterday });
    outreach.create({ company_id: company.id, status: "responded", follow_up_date: yesterday });

    const result = await new FollowUpAlertsService(db, telegram).run();
    expect(result).toEqual({ due: 0, sent: 0, failed: 0 });
  });

  it("keeps re-surfacing a due follow-up on every run — no de-dup tracking by design", async () => {
    const company = companies.create({ name: "Acme" });
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    outreach.create({ company_id: company.id, status: "contacted", follow_up_date: yesterday });

    await new FollowUpAlertsService(db, telegram).run();
    await new FollowUpAlertsService(db, telegram).run();

    expect(telegram.sentMessages).toHaveLength(2);
  });
});

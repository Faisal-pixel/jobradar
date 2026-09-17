import type { DatabaseSync } from "node:sqlite";
import { OutreachRepository } from "../../database/repositories/outreach-repository.js";
import { CompaniesRepository } from "../../database/repositories/companies-repository.js";
import { PeopleRepository } from "../../database/repositories/people-repository.js";
import { JobsRepository } from "../../database/repositories/jobs-repository.js";
import type { TelegramClient } from "./telegram-client.js";
import { formatFollowUpAlert } from "./templates.js";
import { logger } from "../../shared/logger.js";

export interface FollowUpAlertsSummary {
  due: number;
  sent: number;
  failed: number;
}

// Outreach is empty until Phase 6 — this legitimately has nothing to
// send right now, and that's the expected, correct result: due=0, sent=0,
// no Telegram message at all (not a "0 follow-ups due" message every
// run — that would just be daily-digest-style noise for something that's
// meant to be a per-item alert, same reasoning as job-alerts sending
// nothing when there are no Category-A candidates).
export class FollowUpAlertsService {
  private readonly outreach: OutreachRepository;
  private readonly companies: CompaniesRepository;
  private readonly people: PeopleRepository;
  private readonly jobs: JobsRepository;

  constructor(
    db: DatabaseSync,
    private readonly telegram: TelegramClient,
  ) {
    this.outreach = new OutreachRepository(db);
    this.companies = new CompaniesRepository(db);
    this.people = new PeopleRepository(db);
    this.jobs = new JobsRepository(db);
  }

  async run(): Promise<FollowUpAlertsSummary> {
    const today = new Date().toISOString().slice(0, 10);
    const due = this.outreach.findDueFollowUps(today);

    let sent = 0;
    let failed = 0;
    for (const contact of due) {
      const company = contact.company_id !== null ? this.companies.findById(contact.company_id) : null;
      const person = contact.person_id !== null ? this.people.findById(contact.person_id) : null;
      const job = contact.job_id !== null ? this.jobs.findById(contact.job_id) : null;

      try {
        await this.telegram.sendMessage(
          formatFollowUpAlert(contact, company?.name ?? null, person?.name ?? null, job?.title ?? null),
        );
        sent++;
      } catch (cause) {
        failed++;
        logger.error("Failed to send follow-up alert", { outreachId: contact.id, error: String(cause) });
      }
    }

    logger.info("Follow-up alerts run complete", { due: due.length, sent, failed });
    return { due: due.length, sent, failed };
  }
}

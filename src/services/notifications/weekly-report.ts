import type { DatabaseSync } from "node:sqlite";
import { JobsRepository } from "../../database/repositories/jobs-repository.js";
import { ApplicationsRepository } from "../../database/repositories/applications-repository.js";
import { OutreachRepository } from "../../database/repositories/outreach-repository.js";
import type { TelegramClient } from "./telegram-client.js";
import { formatWeeklyReport } from "./templates.js";
import { logger } from "../../shared/logger.js";

const LOOKBACK_DAYS = 7;
const REACHED_OUT_STATUSES = ["contacted", "responded", "no_response"] as const;

export interface WeeklyReportSummary {
  jobsDiscovered: number;
  newApplications: number;
  applicationsWithActivity: number;
  newOutreach: number;
  overdueFollowUps: number;
}

// New Phase 10 service — the one piece of this phase with no existing
// CLI command to wrap, since nothing like it existed before. Grounded
// only in what's actually queryable (see CLAUDE.md Decisions Log): no
// status-history table exists, so this reports activity/current-status
// snapshots, never a "moved from X to Y" transition.
export class WeeklyReportService {
  private readonly jobs: JobsRepository;
  private readonly applications: ApplicationsRepository;
  private readonly outreach: OutreachRepository;

  constructor(
    db: DatabaseSync,
    private readonly telegram: TelegramClient,
  ) {
    this.jobs = new JobsRepository(db);
    this.applications = new ApplicationsRepository(db);
    this.outreach = new OutreachRepository(db);
  }

  async buildMessage(): Promise<{ message: string; summary: WeeklyReportSummary }> {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const today = new Date().toISOString().slice(0, 10);

    const jobs = this.jobs.findDiscoveredSince(since);
    const newApplications = this.applications.findCreatedSince(since);
    const updatedApplications = this.applications.findUpdatedSince(since);
    const newOutreach = this.outreach.findCreatedSince(since);
    const overdueFollowUps = this.outreach.findDueFollowUps(today);

    const allOutreach = this.outreach.list();
    const reachedOut = allOutreach.filter((contact) =>
      (REACHED_OUT_STATUSES as readonly string[]).includes(contact.status),
    );
    const responded = reachedOut.filter((contact) => contact.status === "responded");

    const summary: WeeklyReportSummary = {
      jobsDiscovered: jobs.length,
      newApplications: newApplications.length,
      applicationsWithActivity: updatedApplications.length,
      newOutreach: newOutreach.length,
      overdueFollowUps: overdueFollowUps.length,
    };

    const message = formatWeeklyReport({
      jobs,
      newApplicationsCount: newApplications.length,
      updatedApplications,
      newOutreach,
      reachedOutCount: reachedOut.length,
      respondedCount: responded.length,
      overdueFollowUpsCount: overdueFollowUps.length,
    });

    return { message, summary };
  }

  async run(): Promise<WeeklyReportSummary> {
    const { message, summary } = await this.buildMessage();
    await this.telegram.sendMessage(message);
    logger.info("Weekly report sent", { ...summary });
    return summary;
  }
}

import type { DatabaseSync } from "node:sqlite";
import { JobsRepository } from "../../database/repositories/jobs-repository.js";
import { CompaniesRepository } from "../../database/repositories/companies-repository.js";
import { PeopleRepository } from "../../database/repositories/people-repository.js";
import { ApplicationsRepository } from "../../database/repositories/applications-repository.js";
import { OutreachRepository } from "../../database/repositories/outreach-repository.js";
import { SheetSyncStatusRepository } from "../../database/repositories/sheet-sync-status-repository.js";
import type { SheetsClient } from "./sheets-client.js";
import {
  mapJobsSheet,
  mapCompaniesSheet,
  mapPeopleSheet,
  mapApplicationsSheet,
  mapOutreachSheet,
} from "./row-mappers.js";
import { logger } from "../../shared/logger.js";

export const SHEET_SYNC_TARGET = "google_sheets";
export const SHEET_TAB_NAMES = ["Jobs", "Companies", "People", "Applications", "Outreach"] as const;

// Full overwrite every run (CLAUDE.md: "SQLite stays the source of truth,
// Sheets is a synced view only") — simplest option, and self-correcting:
// a partial failure mid-sync just gets overwritten cleanly by the next
// successful run, since nothing here is incremental/diffed.
export class SheetsSyncService {
  private readonly jobs: JobsRepository;
  private readonly companies: CompaniesRepository;
  private readonly people: PeopleRepository;
  private readonly applications: ApplicationsRepository;
  private readonly outreach: OutreachRepository;
  private readonly syncStatus: SheetSyncStatusRepository;

  constructor(
    db: DatabaseSync,
    private readonly client: SheetsClient,
  ) {
    this.jobs = new JobsRepository(db);
    this.companies = new CompaniesRepository(db);
    this.people = new PeopleRepository(db);
    this.applications = new ApplicationsRepository(db);
    this.outreach = new OutreachRepository(db);
    this.syncStatus = new SheetSyncStatusRepository(db);
  }

  async sync(): Promise<void> {
    try {
      const companies = this.companies.list();
      const jobs = this.jobs.list();
      const people = this.people.list();
      const applications = this.applications.list();
      const outreach = this.outreach.list();

      const companiesById = new Map(companies.map((company) => [company.id, company]));
      const jobsById = new Map(jobs.map((job) => [job.id, job]));
      const peopleById = new Map(people.map((person) => [person.id, person]));

      await this.client.ensureTabs([...SHEET_TAB_NAMES]);
      await this.client.clearAndWrite({
        Jobs: mapJobsSheet(jobs, companiesById),
        Companies: mapCompaniesSheet(companies),
        People: mapPeopleSheet(people, companiesById),
        Applications: mapApplicationsSheet(applications, jobsById, companiesById),
        Outreach: mapOutreachSheet(outreach, companiesById, peopleById, jobsById),
      });

      this.syncStatus.recordSuccess(SHEET_SYNC_TARGET);
      logger.info("Google Sheets sync complete", {
        jobs: jobs.length,
        companies: companies.length,
        people: people.length,
        applications: applications.length,
        outreach: outreach.length,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      this.syncStatus.recordFailure(SHEET_SYNC_TARGET, message);
      logger.error("Google Sheets sync failed", { error: message });
      throw cause;
    }
  }
}

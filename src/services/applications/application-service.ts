import type { DatabaseSync } from "node:sqlite";
import { ApplicationsRepository } from "../../database/repositories/applications-repository.js";
import { JobsRepository } from "../../database/repositories/jobs-repository.js";
import type { Application, NewApplication, ApplicationPatch, ApplicationStatus } from "../../domain/applications/application.js";
import type { JobStatus } from "../../domain/jobs/job.js";
import { ValidationError } from "../../shared/errors.js";
import { logger } from "../../shared/logger.js";

// Application.status -> Job.status, applied automatically whenever an
// Application is created or updated with a mapped status (Phase 6
// Decisions Log). Only the unambiguous cases are covered:
//   - 'planned' has no entry — you haven't actually applied yet, so the
//     Job shouldn't move.
//   - 'offer' has no entry — CLAUDE.md's Job states have no "offer"
//     equivalent; inventing one here would be presumptuous. The Job is
//     left for Faisal to update manually once there's a real offer.
//   - screening/technical/onsite all collapse into Job's single coarser
//     'interviewing' bucket.
const JOB_STATUS_BY_APPLICATION_STATUS: Partial<Record<ApplicationStatus, JobStatus>> = {
  applied: "applied",
  screening: "interviewing",
  technical: "interviewing",
  onsite: "interviewing",
  rejected: "rejected",
  withdrawn: "closed",
};

// The one-way nudge from Application to Job status lives here, not in
// ApplicationsRepository — CLAUDE.md's layering principle keeps
// repositories as pure SQLite access with no business logic.
export class ApplicationService {
  private readonly applications: ApplicationsRepository;
  private readonly jobs: JobsRepository;

  constructor(db: DatabaseSync) {
    this.applications = new ApplicationsRepository(db);
    this.jobs = new JobsRepository(db);
  }

  logApplication(input: NewApplication): Application {
    if (input.job_id == null && input.company_id == null) {
      throw new ValidationError("logApplication requires at least one of job_id or company_id");
    }

    // Auto-derive company_id from the job when only job_id is given —
    // an Application can also exist for a job JobRadar never discovered
    // (company_id set directly, job_id left null), so this only fills
    // in what's missing, never overrides an explicit company_id.
    let companyId = input.company_id ?? null;
    if (input.job_id != null && companyId === null) {
      companyId = this.jobs.findById(input.job_id)?.company_id ?? null;
    }

    const application = this.applications.create({ ...input, company_id: companyId });
    this.syncJobStatus(application);
    return application;
  }

  updateApplicationStatus(id: number, patch: ApplicationPatch): Application {
    const application = this.applications.update(id, patch);
    if (patch.status) this.syncJobStatus(application);
    return application;
  }

  private syncJobStatus(application: Application): void {
    if (application.job_id === null) return;
    const mappedStatus = JOB_STATUS_BY_APPLICATION_STATUS[application.status];
    if (!mappedStatus) return;

    this.jobs.update(application.job_id, { status: mappedStatus });
    logger.info("Job status synced from application status", {
      jobId: application.job_id,
      applicationId: application.id,
      applicationStatus: application.status,
      jobStatus: mappedStatus,
    });
  }
}

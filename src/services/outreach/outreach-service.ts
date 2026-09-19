import type { DatabaseSync } from "node:sqlite";
import { OutreachRepository } from "../../database/repositories/outreach-repository.js";
import { JobsRepository } from "../../database/repositories/jobs-repository.js";
import type { Outreach, NewOutreach, OutreachPatch } from "../../domain/outreach/outreach.js";
import { ValidationError } from "../../shared/errors.js";

// Deliberately does not touch Job.status (unlike ApplicationService) —
// outreach is a parallel channel (you might message a founder before or
// instead of ever formally applying), and Job's status values have no
// clean "outreach in progress" equivalent (Phase 6 Decisions Log).
export class OutreachService {
  private readonly outreach: OutreachRepository;
  private readonly jobs: JobsRepository;

  constructor(db: DatabaseSync) {
    this.outreach = new OutreachRepository(db);
    this.jobs = new JobsRepository(db);
  }

  logOutreach(input: NewOutreach): Outreach {
    if (input.company_id == null && input.person_id == null && input.job_id == null) {
      throw new ValidationError("logOutreach requires at least one of company_id, person_id, or job_id");
    }

    // Auto-derive company_id from the job when only job_id is given —
    // same pattern as ApplicationService.logApplication, never overriding
    // an explicit company_id (e.g. outreach to a contact at a different
    // company than the linked job).
    let companyId = input.company_id ?? null;
    if (input.job_id != null && companyId === null) {
      companyId = this.jobs.findById(input.job_id)?.company_id ?? null;
    }

    return this.outreach.create({ ...input, company_id: companyId });
  }

  updateOutreach(id: number, patch: OutreachPatch): Outreach {
    return this.outreach.update(id, patch);
  }
}

import { describe, it, expect, beforeEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../../test-helpers/create-test-db.js";
import { OutreachService } from "../../../src/services/outreach/outreach-service.js";
import { JobsRepository } from "../../../src/database/repositories/jobs-repository.js";
import { CompaniesRepository } from "../../../src/database/repositories/companies-repository.js";
import { ValidationError } from "../../../src/shared/errors.js";

describe("OutreachService", () => {
  let db: DatabaseSync;
  let jobs: JobsRepository;
  let companies: CompaniesRepository;
  let service: OutreachService;
  let jobId: number;
  let companyId: number;

  beforeEach(() => {
    db = createTestDb();
    jobs = new JobsRepository(db);
    companies = new CompaniesRepository(db);
    const company = companies.create({ name: "Acme" });
    companyId = company.id;
    const job = jobs.create({
      title: "Backend Engineer",
      source: "yc",
      source_job_id: "1",
      company_id: companyId,
      status: "qualified",
    });
    jobId = job.id;
    service = new OutreachService(db);
  });

  it("throws ValidationError when none of company_id, person_id, job_id is given", () => {
    expect(() => service.logOutreach({ channel: "linkedin" })).toThrow(ValidationError);
  });

  it("creates an outreach record when at least job_id is given", () => {
    const contact = service.logOutreach({ job_id: jobId, channel: "linkedin" });
    expect(contact.job_id).toBe(jobId);
  });

  it("auto-derives company_id from the job when only job_id is given", () => {
    const contact = service.logOutreach({ job_id: jobId, channel: "linkedin" });
    expect(contact.company_id).toBe(companyId);
  });

  it("respects an explicit company_id instead of deriving it, e.g. a contact at a different company", () => {
    const otherCompanyId = companies.create({ name: "Referral Co" }).id;
    const contact = service.logOutreach({ job_id: jobId, company_id: otherCompanyId, channel: "linkedin" });
    expect(contact.company_id).toBe(otherCompanyId);
  });

  it("never changes the linked Job's status — outreach is a parallel channel", () => {
    service.logOutreach({ job_id: jobId, status: "contacted" });
    expect(jobs.findById(jobId)?.status).toBe("qualified"); // unchanged
  });

  it("updateOutreach updates fields without touching Job.status", () => {
    const contact = service.logOutreach({ job_id: jobId, status: "draft" });
    const updated = service.updateOutreach(contact.id, { status: "contacted", follow_up_date: "2026-10-01" });
    expect(updated.status).toBe("contacted");
    expect(updated.follow_up_date).toBe("2026-10-01");
    expect(jobs.findById(jobId)?.status).toBe("qualified");
  });
});

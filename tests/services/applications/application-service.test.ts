import { describe, it, expect, beforeEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../../test-helpers/create-test-db.js";
import { ApplicationService } from "../../../src/services/applications/application-service.js";
import { JobsRepository } from "../../../src/database/repositories/jobs-repository.js";
import { CompaniesRepository } from "../../../src/database/repositories/companies-repository.js";
import { ValidationError } from "../../../src/shared/errors.js";

describe("ApplicationService", () => {
  let db: DatabaseSync;
  let jobs: JobsRepository;
  let companies: CompaniesRepository;
  let service: ApplicationService;
  let jobId: number;
  let companyId: number;

  beforeEach(() => {
    db = createTestDb();
    jobs = new JobsRepository(db);
    companies = new CompaniesRepository(db);
    service = new ApplicationService(db);

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
  });

  it("throws ValidationError when neither job_id nor company_id is given", () => {
    expect(() => service.logApplication({})).toThrow(ValidationError);
  });

  it("auto-derives company_id from the job when only job_id is given", () => {
    const application = service.logApplication({ job_id: jobId });
    expect(application.company_id).toBe(companyId);
  });

  it("respects an explicit company_id instead of deriving it, for applications outside JobRadar's discovery", () => {
    // A company Faisal is applying to directly — not linked to any
    // job_id, since JobRadar never discovered this listing.
    const otherCompanyId = companies.create({ name: "Direct Application Co" }).id;
    const application = service.logApplication({ company_id: otherCompanyId });
    expect(application.company_id).toBe(otherCompanyId);
    expect(application.job_id).toBeNull();
  });

  it("logging a 'planned' application does not change the Job's status", () => {
    service.logApplication({ job_id: jobId, status: "planned" });
    expect(jobs.findById(jobId)?.status).toBe("qualified");
  });

  it.each([
    ["applied", "applied"],
    ["screening", "interviewing"],
    ["technical", "interviewing"],
    ["onsite", "interviewing"],
    ["rejected", "rejected"],
    ["withdrawn", "closed"],
  ] as const)("updating Application status to '%s' syncs Job status to '%s'", (applicationStatus, expectedJobStatus) => {
    const application = service.logApplication({ job_id: jobId, status: "planned" });
    service.updateApplicationStatus(application.id, { status: applicationStatus });
    expect(jobs.findById(jobId)?.status).toBe(expectedJobStatus);
  });

  it("updating Application status to 'offer' does not change the Job's status", () => {
    const application = service.logApplication({ job_id: jobId, status: "applied" });
    service.updateApplicationStatus(application.id, { status: "offer" });
    expect(jobs.findById(jobId)?.status).toBe("applied"); // unchanged from the prior sync
  });

  it("updating a non-status field does not re-trigger the Job sync", () => {
    const application = service.logApplication({ job_id: jobId, status: "applied" });
    jobs.update(jobId, { status: "archived" }); // simulate Faisal manually overriding afterward
    service.updateApplicationStatus(application.id, { notes: "just a note" });
    expect(jobs.findById(jobId)?.status).toBe("archived"); // untouched
  });

  it("does not touch Job.status when the application has no job_id", () => {
    const application = service.logApplication({ company_id: companyId, status: "planned" });
    service.updateApplicationStatus(application.id, { status: "applied" });
    // No job to check against — this just confirms no error/crash occurs.
    expect(application.job_id).toBeNull();
  });
});

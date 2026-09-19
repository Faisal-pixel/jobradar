import { describe, it, expect, beforeEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../../test-helpers/create-test-db.js";
import { ApplicationsRepository } from "../../../src/database/repositories/applications-repository.js";
import { CompaniesRepository } from "../../../src/database/repositories/companies-repository.js";
import { JobsRepository } from "../../../src/database/repositories/jobs-repository.js";
import { NotFoundError, ValidationError } from "../../../src/shared/errors.js";

describe("ApplicationsRepository", () => {
  let db: DatabaseSync;
  let repo: ApplicationsRepository;
  let jobId: number;

  beforeEach(() => {
    db = createTestDb();
    repo = new ApplicationsRepository(db);
    const companies = new CompaniesRepository(db);
    const jobs = new JobsRepository(db);
    const company = companies.create({ name: "Acme" });
    jobId = jobs.create({ title: "Backend Engineer", source: "yc", source_job_id: "1", company_id: company.id }).id;
  });

  it("creates an application with a default status of 'planned'", () => {
    const application = repo.create({ job_id: jobId });
    expect(application.status).toBe("planned");
  });

  it("finds an application by id, and returns null when missing", () => {
    const created = repo.create({ job_id: jobId });
    expect(repo.findById(created.id)).toEqual(created);
    expect(repo.findById(9999)).toBeNull();
  });

  it("lists applications in insertion order", () => {
    repo.create({ job_id: jobId, role: "First" });
    repo.create({ job_id: jobId, role: "Second" });
    expect(repo.list().map((a) => a.role)).toEqual(["First", "Second"]);
  });

  it("updates fields and bumps updated_at", async () => {
    const created = repo.create({ job_id: jobId, status: "planned" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = repo.update(created.id, { status: "applied" });
    expect(updated.status).toBe("applied");
    expect(updated.updated_at).not.toBe(created.updated_at);
  });

  it("throws NotFoundError when updating a missing application", () => {
    expect(() => repo.update(9999, { status: "applied" })).toThrow(NotFoundError);
  });

  it("throws ValidationError when updating with no fields", () => {
    const created = repo.create({ job_id: jobId });
    expect(() => repo.update(created.id, {})).toThrow(ValidationError);
  });

  it("deletes an application", () => {
    const created = repo.create({ job_id: jobId });
    repo.delete(created.id);
    expect(repo.findById(created.id)).toBeNull();
  });

  describe("findByFilters", () => {
    let firstCompanyId: number;
    let secondJobId: number;
    let secondCompanyId: number;

    beforeEach(() => {
      const companies = new CompaniesRepository(db);
      const jobs = new JobsRepository(db);
      firstCompanyId = jobs.findById(jobId)!.company_id!;
      const secondCompany = companies.create({ name: "Widgets Inc" });
      secondCompanyId = secondCompany.id;
      secondJobId = jobs.create({ title: "Frontend Engineer", source: "yc", source_job_id: "2", company_id: secondCompanyId }).id;

      repo.create({ job_id: jobId, company_id: firstCompanyId, status: "planned" });
      repo.create({ job_id: secondJobId, company_id: secondCompanyId, status: "applied" });
      repo.create({ job_id: secondJobId, company_id: firstCompanyId, status: "applied" });
    });

    it("filters by status", () => {
      expect(repo.findByFilters({ status: "applied" })).toHaveLength(2);
    });

    it("filters by jobId", () => {
      expect(repo.findByFilters({ jobId: secondJobId })).toHaveLength(2);
    });

    it("filters by companyId", () => {
      expect(repo.findByFilters({ companyId: secondCompanyId })).toHaveLength(1);
    });

    it("combines filters with AND semantics", () => {
      expect(repo.findByFilters({ jobId: secondJobId, companyId: secondCompanyId })).toHaveLength(1);
    });

    it("returns everything when no filters are given", () => {
      expect(repo.findByFilters({})).toHaveLength(3);
    });
  });
});

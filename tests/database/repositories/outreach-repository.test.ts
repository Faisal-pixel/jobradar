import { describe, it, expect, beforeEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../../test-helpers/create-test-db.js";
import { OutreachRepository } from "../../../src/database/repositories/outreach-repository.js";
import { CompaniesRepository } from "../../../src/database/repositories/companies-repository.js";
import { PeopleRepository } from "../../../src/database/repositories/people-repository.js";
import { JobsRepository } from "../../../src/database/repositories/jobs-repository.js";
import { NotFoundError, ValidationError } from "../../../src/shared/errors.js";

describe("OutreachRepository", () => {
  let db: DatabaseSync;
  let repo: OutreachRepository;
  let companyId: number;

  beforeEach(() => {
    db = createTestDb();
    repo = new OutreachRepository(db);
    const companies = new CompaniesRepository(db);
    companyId = companies.create({ name: "Acme" }).id;
  });

  it("creates an outreach record with a default status of 'draft'", () => {
    const contact = repo.create({ company_id: companyId });
    expect(contact.status).toBe("draft");
  });

  it("finds an outreach record by id, and returns null when missing", () => {
    const created = repo.create({ company_id: companyId });
    expect(repo.findById(created.id)).toEqual(created);
    expect(repo.findById(9999)).toBeNull();
  });

  it("updates fields and bumps updated_at", async () => {
    const created = repo.create({ company_id: companyId, status: "draft" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = repo.update(created.id, { status: "contacted" });
    expect(updated.status).toBe("contacted");
    expect(updated.updated_at).not.toBe(created.updated_at);
  });

  it("throws NotFoundError when updating a missing outreach record", () => {
    expect(() => repo.update(9999, { status: "contacted" })).toThrow(NotFoundError);
  });

  it("throws ValidationError when updating with no fields", () => {
    const created = repo.create({ company_id: companyId });
    expect(() => repo.update(created.id, {})).toThrow(ValidationError);
  });

  it("deletes an outreach record", () => {
    const created = repo.create({ company_id: companyId });
    repo.delete(created.id);
    expect(repo.findById(created.id)).toBeNull();
  });

  describe("findByFilters", () => {
    let secondCompanyId: number;
    let personId: number;
    let secondPersonId: number;
    let jobId: number;
    let secondJobId: number;

    beforeEach(() => {
      const companies = new CompaniesRepository(db);
      const people = new PeopleRepository(db);
      const jobs = new JobsRepository(db);

      secondCompanyId = companies.create({ name: "Widgets Inc" }).id;
      personId = people.create({ company_id: companyId, name: "Jane" }).id;
      secondPersonId = people.create({ company_id: secondCompanyId, name: "Jack" }).id;
      jobId = jobs.create({ title: "Backend Engineer", source: "yc", source_job_id: "1", company_id: companyId }).id;
      secondJobId = jobs.create({ title: "Frontend Engineer", source: "yc", source_job_id: "2", company_id: secondCompanyId }).id;

      repo.create({ company_id: companyId, person_id: personId, job_id: jobId, status: "contacted" });
      repo.create({ company_id: companyId, person_id: secondPersonId, job_id: secondJobId, status: "closed" });
      repo.create({ company_id: secondCompanyId, person_id: personId, job_id: secondJobId, status: "contacted" });
    });

    it("filters by status", () => {
      expect(repo.findByFilters({ status: "contacted" })).toHaveLength(2);
    });

    it("filters by companyId", () => {
      expect(repo.findByFilters({ companyId })).toHaveLength(2);
    });

    it("filters by personId", () => {
      expect(repo.findByFilters({ personId })).toHaveLength(2);
    });

    it("filters by jobId", () => {
      expect(repo.findByFilters({ jobId: secondJobId })).toHaveLength(2);
    });

    it("combines filters with AND semantics", () => {
      expect(repo.findByFilters({ companyId, status: "closed" })).toHaveLength(1);
    });
  });
});

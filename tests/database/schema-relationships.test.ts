import { describe, it, expect, beforeEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../test-helpers/create-test-db.js";
import { CompaniesRepository } from "../../src/database/repositories/companies-repository.js";
import { JobsRepository } from "../../src/database/repositories/jobs-repository.js";
import { PeopleRepository } from "../../src/database/repositories/people-repository.js";
import { ApplicationsRepository } from "../../src/database/repositories/applications-repository.js";
import { OutreachRepository } from "../../src/database/repositories/outreach-repository.js";

// End-to-end check that the full schema wires together the way CLAUDE.md
// describes: a job and a person both belong to a company, an application
// tracks a job, and outreach ties a company + person + job together.
describe("schema relationships", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createTestDb();
  });

  it("links jobs, people, applications, and outreach through a company", () => {
    const companies = new CompaniesRepository(db);
    const jobs = new JobsRepository(db);
    const people = new PeopleRepository(db);
    const applications = new ApplicationsRepository(db);
    const outreach = new OutreachRepository(db);

    const company = companies.create({ name: "Acme Robotics" });
    const job = jobs.create({
      company_id: company.id,
      title: "Founding Engineer",
      source: "ycombinator",
      source_job_id: "yc-1",
    });
    const person = people.create({
      company_id: company.id,
      name: "Jane Founder",
      category: "founder",
    });
    const application = applications.create({
      job_id: job.id,
      company_id: company.id,
      status: "planned",
    });
    const contact = outreach.create({
      company_id: company.id,
      person_id: person.id,
      job_id: job.id,
      channel: "linkedin",
    });

    expect(job.company_id).toBe(company.id);
    expect(person.company_id).toBe(company.id);
    expect(application.job_id).toBe(job.id);
    expect(contact.person_id).toBe(person.id);
  });

  it("SET NULLs a job's company_id when the company is deleted", () => {
    const companies = new CompaniesRepository(db);
    const jobs = new JobsRepository(db);

    const company = companies.create({ name: "Acme Robotics" });
    const job = jobs.create({
      company_id: company.id,
      title: "Founding Engineer",
      source: "ycombinator",
      source_job_id: "yc-1",
    });

    companies.delete(company.id);

    expect(jobs.findById(job.id)?.company_id).toBeNull();
  });

  it("CASCADEs application deletion when its job is deleted", () => {
    const jobs = new JobsRepository(db);
    const applications = new ApplicationsRepository(db);

    const job = jobs.create({ title: "Founding Engineer", source: "ycombinator", source_job_id: "yc-1" });
    const application = applications.create({ job_id: job.id, status: "planned" });

    jobs.delete(job.id);

    expect(applications.findById(application.id)).toBeNull();
  });
});

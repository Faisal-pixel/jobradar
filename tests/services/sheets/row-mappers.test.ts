import { describe, it, expect } from "vitest";
import {
  mapJobsSheet,
  mapCompaniesSheet,
  mapPeopleSheet,
  mapApplicationsSheet,
  mapOutreachSheet,
} from "../../../src/services/sheets/row-mappers.js";
import { buildJob, buildCompany, buildPerson, buildApplication, buildOutreach } from "../../test-helpers/fixtures.js";
import type { Company } from "../../../src/domain/companies/company.js";
import type { Job } from "../../../src/domain/jobs/job.js";
import type { Person } from "../../../src/domain/people/person.js";

describe("mapJobsSheet", () => {
  it("has a header row followed by one row per job", () => {
    const rows = mapJobsSheet([buildJob(), buildJob({ id: 2 })], new Map());
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain("Title");
  });

  it("joins company_id to the company's name, not the raw id", () => {
    const companiesById = new Map<number, Company>([[1, buildCompany({ id: 1, name: "Acme Robotics" })]]);
    const rows = mapJobsSheet([buildJob({ company_id: 1 })], companiesById);
    const titleIndex = rows[0]!.indexOf("Company");
    expect(rows[1]![titleIndex]).toBe("Acme Robotics");
  });

  it("renders null fields as empty strings, not the literal text 'null'", () => {
    const rows = mapJobsSheet([buildJob({ location: null, salary_min: null })], new Map());
    const locationIndex = rows[0]!.indexOf("Location");
    expect(rows[1]![locationIndex]).toBe("");
  });

  it("renders booleans as TRUE/FALSE", () => {
    const rows = mapJobsSheet([buildJob({ remote: true })], new Map());
    const remoteIndex = rows[0]!.indexOf("Remote");
    expect(rows[1]![remoteIndex]).toBe("TRUE");
  });

  it("renders an unresolvable company_id (deleted/missing company) as empty, not a crash", () => {
    const rows = mapJobsSheet([buildJob({ company_id: 999 })], new Map());
    const companyIndex = rows[0]!.indexOf("Company");
    expect(rows[1]![companyIndex]).toBe("");
  });
});

describe("mapCompaniesSheet", () => {
  it("maps every company field including last_active", () => {
    const rows = mapCompaniesSheet([buildCompany({ name: "Acme", last_active: "3 months ago" })]);
    const lastActiveIndex = rows[0]!.indexOf("Last Active");
    expect(rows[1]![lastActiveIndex]).toBe("3 months ago");
  });
});

describe("mapPeopleSheet", () => {
  it("joins company_id to the company name", () => {
    const companiesById = new Map<number, Company>([[1, buildCompany({ id: 1, name: "Acme Robotics" })]]);
    const rows = mapPeopleSheet([buildPerson({ company_id: 1, name: "Jane" })], companiesById);
    const companyIndex = rows[0]!.indexOf("Company");
    expect(rows[1]![companyIndex]).toBe("Acme Robotics");
  });
});

describe("mapApplicationsSheet", () => {
  it("joins job_id to the job title and company_id to the company name", () => {
    const jobsById = new Map<number, Job>([[1, buildJob({ id: 1, title: "Backend Engineer" })]]);
    const companiesById = new Map<number, Company>([[1, buildCompany({ id: 1, name: "Acme Robotics" })]]);
    const rows = mapApplicationsSheet([buildApplication({ job_id: 1, company_id: 1 })], jobsById, companiesById);
    const jobTitleIndex = rows[0]!.indexOf("Job Title");
    const companyIndex = rows[0]!.indexOf("Company");
    expect(rows[1]![jobTitleIndex]).toBe("Backend Engineer");
    expect(rows[1]![companyIndex]).toBe("Acme Robotics");
  });
});

describe("mapOutreachSheet", () => {
  it("joins company, person, and job to their names/titles", () => {
    const companiesById = new Map<number, Company>([[1, buildCompany({ id: 1, name: "Acme Robotics" })]]);
    const peopleById = new Map<number, Person>([[1, buildPerson({ id: 1, name: "Jane Founder" })]]);
    const jobsById = new Map<number, Job>([[1, buildJob({ id: 1, title: "Backend Engineer" })]]);
    const rows = mapOutreachSheet(
      [buildOutreach({ company_id: 1, person_id: 1, job_id: 1 })],
      companiesById,
      peopleById,
      jobsById,
    );
    const header = rows[0]!;
    expect(rows[1]![header.indexOf("Company")]).toBe("Acme Robotics");
    expect(rows[1]![header.indexOf("Person")]).toBe("Jane Founder");
    expect(rows[1]![header.indexOf("Job Title")]).toBe("Backend Engineer");
  });
});

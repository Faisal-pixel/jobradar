import type { Job } from "../../domain/jobs/job.js";
import type { Company } from "../../domain/companies/company.js";
import type { Person } from "../../domain/people/person.js";
import type { Application } from "../../domain/applications/application.js";
import type { Outreach } from "../../domain/outreach/outreach.js";

// Google Sheets cells are just strings — nulls/undefined become empty
// cells rather than the literal text "null", and booleans get a plain
// TRUE/FALSE a human can actually read.
function cell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

export function mapJobsSheet(jobs: Job[], companiesById: Map<number, Company>): string[][] {
  const header = [
    "ID", "Title", "Company", "Status", "Fit Score", "Fit Category", "Remote", "Location",
    "Salary Min", "Salary Max", "Currency", "Source", "Date Found", "Job URL",
    "Application URL", "Fit Explanation",
  ];
  const rows = jobs.map((job) => [
    cell(job.id),
    cell(job.title),
    cell(job.company_id !== null ? companiesById.get(job.company_id)?.name : null),
    cell(job.status),
    cell(job.fit_score),
    cell(job.fit_category),
    cell(job.remote),
    cell(job.location),
    cell(job.salary_min),
    cell(job.salary_max),
    cell(job.salary_currency),
    cell(job.source),
    cell(job.date_found),
    cell(job.job_url),
    cell(job.application_url),
    cell(job.fit_explanation),
  ]);
  return [header, ...rows];
}

export function mapCompaniesSheet(companies: Company[]): string[][] {
  const header = [
    "ID", "Name", "YC Batch", "Team Size", "Industry", "Location", "Website",
    "Last Active", "Funding", "Funding Stage", "Remote Policy", "Description", "Notes",
  ];
  const rows = companies.map((company) => [
    cell(company.id),
    cell(company.name),
    cell(company.yc_batch),
    cell(company.team_size),
    cell(company.industry),
    cell(company.location),
    cell(company.website),
    cell(company.last_active),
    cell(company.funding),
    cell(company.funding_stage),
    cell(company.remote_policy),
    cell(company.description),
    cell(company.notes),
  ]);
  return [header, ...rows];
}

export function mapPeopleSheet(people: Person[], companiesById: Map<number, Company>): string[][] {
  const header = ["ID", "Name", "Company", "Role", "Category", "LinkedIn URL", "Email", "Confidence", "Source", "Notes"];
  const rows = people.map((person) => [
    cell(person.id),
    cell(person.name),
    cell(person.company_id !== null ? companiesById.get(person.company_id)?.name : null),
    cell(person.role),
    cell(person.category),
    cell(person.linkedin_url),
    cell(person.email),
    cell(person.confidence),
    cell(person.source),
    cell(person.notes),
  ]);
  return [header, ...rows];
}

export function mapApplicationsSheet(
  applications: Application[],
  jobsById: Map<number, Job>,
  companiesById: Map<number, Company>,
): string[][] {
  const header = [
    "ID", "Job Title", "Company", "Status", "Date Applied", "Interview Stage",
    "Application URL", "Rejection Reason", "Notes",
  ];
  const rows = applications.map((application) => [
    cell(application.id),
    cell(application.job_id !== null ? jobsById.get(application.job_id)?.title : null),
    cell(application.company_id !== null ? companiesById.get(application.company_id)?.name : null),
    cell(application.status),
    cell(application.date_applied),
    cell(application.interview_stage),
    cell(application.application_url),
    cell(application.rejection_reason),
    cell(application.notes),
  ]);
  return [header, ...rows];
}

export function mapOutreachSheet(
  outreach: Outreach[],
  companiesById: Map<number, Company>,
  peopleById: Map<number, Person>,
  jobsById: Map<number, Job>,
): string[][] {
  const header = [
    "ID", "Company", "Person", "Job Title", "Channel", "Status", "Date Contacted",
    "Follow-up Date", "Response", "Notes",
  ];
  const rows = outreach.map((contact) => [
    cell(contact.id),
    cell(contact.company_id !== null ? companiesById.get(contact.company_id)?.name : null),
    cell(contact.person_id !== null ? peopleById.get(contact.person_id)?.name : null),
    cell(contact.job_id !== null ? jobsById.get(contact.job_id)?.title : null),
    cell(contact.channel),
    cell(contact.status),
    cell(contact.date_contacted),
    cell(contact.follow_up_date),
    cell(contact.response),
    cell(contact.notes),
  ]);
  return [header, ...rows];
}

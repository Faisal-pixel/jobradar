import type { Job } from "../../src/domain/jobs/job.js";
import type { Company } from "../../src/domain/companies/company.js";
import type { Person } from "../../src/domain/people/person.js";
import type { CandidateProfile } from "../../src/domain/candidate-profile/candidate-profile.js";

const NOW = "2026-09-16T00:00:00.000Z";

export function buildJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 1,
    company_id: 1,
    title: "Backend Engineer",
    location: null,
    remote: null,
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    description: null,
    job_url: null,
    application_url: null,
    source: "workatastartup",
    source_job_id: "1",
    date_found: NOW,
    date_posted: null,
    fit_score: null,
    fit_category: null,
    fit_explanation: null,
    status: "new",
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

export function buildCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: 1,
    name: "Acme",
    website: null,
    domain: null,
    yc_batch: null,
    team_size: null,
    industry: null,
    description: null,
    funding: null,
    funding_stage: null,
    location: null,
    remote_policy: null,
    notes: null,
    last_active: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

export function buildPerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 1,
    company_id: 1,
    name: "Jane Founder",
    role: null,
    category: "founder",
    linkedin_url: null,
    email: null,
    source: "workatastartup",
    source_url: null,
    confidence: null,
    notes: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

export function buildCandidateProfile(overrides: Partial<CandidateProfile> = {}): CandidateProfile {
  return {
    id: 1,
    location: "Nigeria",
    location_code: "NG",
    target_titles: ["Backend Engineer", "Founding Engineer"],
    stack_interest: ["TypeScript", "Node.js", "distributed systems"],
    company_size_sweet_spot: { min: 5, max: 30 },
    company_size_secondary: { min: 31, max: 50 },
    company_size_opportunistic: { min: 2, max: 4 },
    prefer_recent_yc_batch: true,
    notes: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

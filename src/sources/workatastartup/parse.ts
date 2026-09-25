import * as cheerio from "cheerio";
import type { NewJob } from "../../domain/jobs/job.js";
import type { NewCompany } from "../../domain/companies/company.js";
import type { NewPerson } from "../../domain/people/person.js";
import type { DiscoveredJob } from "../job-source.js";
import type { WaasSearchJob, WaasJobDetail, WaasCompanyDetail, WaasFounder } from "./types.js";

export const SOURCE_NAME = "workatastartup";

function jobUrl(id: number): string {
  return `https://www.workatastartup.com/jobs/${id}`;
}

// Extracts the Inertia `data-page` payload from a Work at a Startup HTML
// response (used for /jobs/{id} — the search endpoint is already plain
// JSON, no HTML involved there). Using cheerio's .attr() instead of a
// hand-rolled regex means HTML-entity decoding (&quot; etc.) is handled
// correctly rather than approximated.
export function extractInertiaPageProps(html: string): unknown {
  const $ = cheerio.load(html);
  const raw = $("[data-page]").first().attr("data-page");
  if (!raw) {
    throw new Error("No Inertia data-page attribute found in response HTML — page shape may have changed");
  }
  const page = JSON.parse(raw) as { props?: unknown };
  return page.props;
}

export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return cheerio.load(html).text().replace(/\s+/g, " ").trim();
}

// No boolean "remote" field exists anywhere in this source's data — see
// CLAUDE.md Decisions Log #14. This is an inference from free-text
// location, not a confirmed fact.
export function inferRemote(location: string | null | undefined): boolean {
  return Boolean(location) && /remote/i.test(location as string);
}

// Below this, a parsed number can't be a real annual salary — seen in
// practice on a live listing ("$100 - $165", almost certainly a listing
// error meaning $100K-$165K with the K dropped). Rather than guess what
// was meant (fabrication), an implausible result is rejected to null:
// an honest "we don't know" beats a confidently wrong number silently
// feeding Phase 3's scoring later.
const MIN_PLAUSIBLE_ANNUAL_SALARY = 1000;

// Salaries only ever appear as strings like "$80K - $140K" or "$150K".
// Every observed sample uses $, so currency is set to USD only when a
// dollar amount was actually found — never assumed otherwise.
export function parseSalary(raw: string | null | undefined): {
  min: number | null;
  max: number | null;
  currency: string | null;
} {
  if (!raw) return { min: null, max: null, currency: null };

  const matches = [...raw.matchAll(/\$([\d,.]+)\s*(K)?/gi)];
  if (matches.length === 0) return { min: null, max: null, currency: null };

  const numbers = matches.map((m) => {
    const amount = parseFloat((m[1] as string).replace(/,/g, ""));
    return m[2] ? Math.round(amount * 1000) : Math.round(amount);
  });

  const min = numbers[0] ?? null;
  const max = (numbers.length > 1 ? numbers[numbers.length - 1] : numbers[0]) ?? null;

  if (min !== null && min < MIN_PLAUSIBLE_ANNUAL_SALARY) {
    return { min: null, max: null, currency: null };
  }
  return { min, max, currency: "USD" };
}

export function extractDomain(websiteUrl: string | null | undefined): string | null {
  if (!websiteUrl) return null;
  try {
    return new URL(websiteUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function composeDescription(detail: WaasJobDetail): string | null {
  const facts: string[] = [];
  if (detail.sponsorsVisa) facts.push(`Visa: ${detail.sponsorsVisa}`);
  if (detail.minExperience) facts.push(`Min experience: ${detail.minExperience}`);
  if (detail.skills && detail.skills.length > 0) facts.push(`Skills: ${detail.skills.join(", ")}`);

  const body = stripHtml(detail.descriptionHtml);
  const header = facts.join("\n");

  if (header && body) return `${header}\n\n${body}`;
  return header || body || null;
}

// Cheap tier: normalizes a /jobs/search result directly into a
// DiscoveredJob. No detail-page fetch involved, so several fields are
// honestly null here (job description, visa, company website/team size)
// rather than guessed — they get filled in later if/when getJob() enriches
// this specific job (see SourceManager: only genuinely new jobs get enriched).
export function normalizeSearchJob(raw: WaasSearchJob): DiscoveredJob {
  const salary = parseSalary(raw.salary);

  const job: NewJob = {
    title: raw.title,
    source: SOURCE_NAME,
    source_job_id: String(raw.id),
    location: raw.location ?? null,
    remote: inferRemote(raw.location),
    salary_min: salary.min,
    salary_max: salary.max,
    salary_currency: salary.currency,
    description: null,
    job_url: jobUrl(raw.id),
    application_url: raw.applyUrl ?? null,
    date_found: new Date().toISOString(),
  };

  const company: NewCompany = {
    name: raw.companyName,
    yc_batch: raw.companyBatch ?? null,
    description: raw.companyOneLiner ?? null,
    // Only available on this cheap tier, not the detail page — see
    // SourceManager.enrich(), which merges this across tiers rather
    // than letting detail-tier enrichment silently drop it.
    last_active: raw.companyLastActiveAt ?? null,
    // Same identifier Y Combinator's own company pages use (Phase 9's
    // research_company) — available on both tiers, so captured here too.
    slug: raw.companySlug,
  };

  return { job, company };
}

function normalizeFounder(founder: WaasFounder, sourceUrl: string): NewPerson {
  const notes = [founder.bio, founder.pastCompanies ? `Past: ${founder.pastCompanies}` : null]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");

  return {
    name: founder.name,
    category: "founder",
    linkedin_url: founder.linkedin ?? null,
    source: SOURCE_NAME,
    source_url: sourceUrl,
    notes: notes || null,
  };
}

// Rich tier: normalizes a /jobs/{id} detail-page payload (job + company
// both embedded together) into a DiscoveredJob with the fuller field set
// only the detail page provides.
export function normalizeJobDetail(
  detail: WaasJobDetail,
  company: WaasCompanyDetail,
  applyUrl: string | null | undefined,
): DiscoveredJob {
  const salary = parseSalary(detail.salaryRange);
  const website = company.url ?? null;

  const job: NewJob = {
    title: detail.title,
    source: SOURCE_NAME,
    source_job_id: String(detail.id),
    location: detail.location ?? null,
    remote: inferRemote(detail.location),
    salary_min: salary.min,
    salary_max: salary.max,
    salary_currency: salary.currency,
    description: composeDescription(detail),
    job_url: jobUrl(detail.id),
    application_url: applyUrl ?? null,
    date_found: new Date().toISOString(),
  };

  const newCompany: NewCompany = {
    name: company.name,
    yc_batch: company.batch ?? null,
    description: company.description ?? null,
    website,
    domain: extractDomain(website),
    team_size: company.teamSize ?? null,
    industry: company.industry ?? null,
    location: company.location ?? null,
    slug: company.slug,
  };

  const founders = company.founders?.map((founder) => normalizeFounder(founder, jobUrl(detail.id))) ?? [];

  return { job, company: newCompany, founders };
}

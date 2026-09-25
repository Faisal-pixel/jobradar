import type { DatabaseSync } from "node:sqlite";
import { CompaniesRepository } from "../../database/repositories/companies-repository.js";
import { JobsRepository } from "../../database/repositories/jobs-repository.js";
import { WorkAtAStartupSource } from "../../sources/workatastartup/index.js";
import { stripHtml } from "../../sources/workatastartup/parse.js";
import { fetchYcCompanyPage, guessCompanySlug, type YcCompanyPage } from "./yc-company-page.js";
import { fetchGithubOrgSignal, type GithubRepoSignal } from "./github-signal.js";
import { NotFoundError } from "../../shared/errors.js";

// Every field is tagged with exactly where it came from — CLAUDE.md's
// hard "never fabricate" rule, applied to research: a null value always
// comes with a specific reason (source unreachable, not provided, no
// link declared), never presented the same way as "we don't know."
export interface ResearchField<T> {
  value: T | null;
  source: string;
}

// "Present" excludes not just null/undefined but "" and [] too — both Y
// Combinator's and Work at a Startup's own payloads use an empty string
// for an unset link field, not null (confirmed live: Adam's cb_url,
// Mason's github_url) — normalized here, once, rather than trusting
// every call site to remember a truthy check on the value it stores.
function isPresent(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function field<T>(value: T | null | undefined, source: string): ResearchField<T> {
  return { value: isPresent(value) ? (value as T) : null, source };
}

// Y Combinator's own payload uses "" the same way, for the github_url
// this reads before following it to GitHub's API.
function emptyToNull(value: string | null | undefined): string | null {
  return isPresent(value) ? (value as string) : null;
}

// One YC field's own presence, independent of whether the page as a
// whole was found — a located page with this one field left blank is
// "not provided," not "we don't know" the way a missing page is.
function ycField<T>(page: YcCompanyPage | null, value: T | null | undefined): ResearchField<T> {
  if (!page) return field<T>(null, NOT_AVAILABLE.noYcPage);
  return field(value, isPresent(value) ? YC_SOURCE : NOT_AVAILABLE.notProvided("Y Combinator"));
}

const NOT_AVAILABLE = {
  noKnownJob: "not available — no known job listing for this company",
  notProvided: (via: string) => `not available — not provided by ${via}`,
  noYcPage: "not available — could not locate a Y Combinator page for this company",
  noGithubLink: "not available — no GitHub link declared",
  githubUnreachable: "not available — GitHub lookup failed or was rate-limited",
} as const;

const WAAS_SOURCE = "self-declared (Work at a Startup)";
const YC_SOURCE = "self-declared (Y Combinator)";
const GITHUB_SOURCE = "public GitHub data — reflects public repos, not a confirmed company-wide stack";

export interface CompanyResearchResult {
  companyId: number;
  workAtAStartup: {
    techStack: ResearchField<string>;
    hiringDescription: ResearchField<string>;
    industries: ResearchField<string[]>;
    facebookUrl: ResearchField<string>;
    twitterUrl: ResearchField<string>;
  };
  ycombinator: {
    linkedinUrl: ResearchField<string>;
    twitterUrl: ResearchField<string>;
    githubUrl: ResearchField<string>;
    crunchbaseUrl: ResearchField<string>;
    tags: ResearchField<string[]>;
    yearFounded: ResearchField<number>;
    status: ResearchField<string>;
  };
  github: {
    signal: ResearchField<GithubRepoSignal[]>;
  };
}

export class CompanyResearchService {
  private readonly companies: CompaniesRepository;
  private readonly jobs: JobsRepository;
  private readonly waas: WorkAtAStartupSource;

  constructor(db: DatabaseSync) {
    this.companies = new CompaniesRepository(db);
    this.jobs = new JobsRepository(db);
    this.waas = new WorkAtAStartupSource();
  }

  async researchCompany(companyId: number): Promise<CompanyResearchResult> {
    const company = this.companies.findById(companyId);
    if (!company) throw new NotFoundError("Company", companyId);

    const [waasResult, ycPage] = await Promise.all([
      this.researchViaWorkAtAStartup(companyId),
      this.researchViaYc(company.slug, company.name),
    ]);

    // Learned the real slug for the first time (a guess that resolved,
    // or workatastartup carried one for a company discovered before
    // migration 007) — worth persisting so future calls don't re-guess.
    if (ycPage && !company.slug) {
      this.companies.update(companyId, { slug: ycPage.slug });
    }

    const githubUrl = emptyToNull(ycPage?.github_url);
    const signal = githubUrl ? await fetchGithubOrgSignal(githubUrl) : null;

    return {
      companyId,
      workAtAStartup: waasResult,
      ycombinator: {
        linkedinUrl: ycField(ycPage, ycPage?.linkedin_url),
        twitterUrl: ycField(ycPage, ycPage?.twitter_url),
        githubUrl: ycField(ycPage, ycPage?.github_url),
        crunchbaseUrl: ycField(ycPage, ycPage?.cb_url),
        tags: ycField(ycPage, ycPage?.tags),
        yearFounded: ycField(ycPage, ycPage?.year_founded),
        status: ycField(ycPage, ycPage?.ycdc_status),
      },
      github: {
        signal: field(
          signal,
          signal ? GITHUB_SOURCE : githubUrl ? NOT_AVAILABLE.githubUnreachable : NOT_AVAILABLE.noGithubLink,
        ),
      },
    };
  }

  private async researchViaWorkAtAStartup(companyId: number): Promise<CompanyResearchResult["workAtAStartup"]> {
    const [anyJob] = this.jobs.findByFilters({ companyId });
    if (!anyJob) {
      const unavailable = NOT_AVAILABLE.noKnownJob;
      return {
        techStack: field<string>(null, unavailable),
        hiringDescription: field<string>(null, unavailable),
        industries: field<string[]>(null, unavailable),
        facebookUrl: field<string>(null, unavailable),
        twitterUrl: field<string>(null, unavailable),
      };
    }

    const detail = await this.waas.getCompanyResearchDetail(anyJob.source_job_id);
    if (!detail) {
      // The job that led us here has itself since disappeared from Work
      // at a Startup — see research_job for surfacing that specifically.
      const unavailable = NOT_AVAILABLE.noKnownJob;
      return {
        techStack: field<string>(null, unavailable),
        hiringDescription: field<string>(null, unavailable),
        industries: field<string[]>(null, unavailable),
        facebookUrl: field<string>(null, unavailable),
        twitterUrl: field<string>(null, unavailable),
      };
    }

    const notProvided = NOT_AVAILABLE.notProvided("Work at a Startup");
    const techStack = detail.techDescriptionHtml ? stripHtml(detail.techDescriptionHtml) : null;
    const hiringDescription = detail.hiringDescriptionHtml ? stripHtml(detail.hiringDescriptionHtml) : null;
    return {
      techStack: field(techStack, techStack ? WAAS_SOURCE : notProvided),
      hiringDescription: field(hiringDescription, hiringDescription ? WAAS_SOURCE : notProvided),
      industries: field(detail.industries, detail.industries?.length ? WAAS_SOURCE : notProvided),
      facebookUrl: field(detail.facebookUrl, detail.facebookUrl ? WAAS_SOURCE : notProvided),
      twitterUrl: field(detail.twitterUrl, detail.twitterUrl ? WAAS_SOURCE : notProvided),
    };
  }

  private async researchViaYc(existingSlug: string | null, companyName: string): Promise<YcCompanyPage | null> {
    const slug = existingSlug ?? guessCompanySlug(companyName);
    return fetchYcCompanyPage(slug);
  }
}

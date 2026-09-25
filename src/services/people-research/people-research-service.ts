import type { DatabaseSync } from "node:sqlite";
import { CompaniesRepository } from "../../database/repositories/companies-repository.js";
import { PeopleRepository } from "../../database/repositories/people-repository.js";
import { fetchYcCompanyPage, guessCompanySlug } from "../company-research/yc-company-page.js";
import { NotFoundError } from "../../shared/errors.js";

// Read-only / informational, same principle as CLAUDE.md's drafting-tools
// rule ("nothing sends automatically"): this surfaces what it finds, it
// never calls PeopleRepository.create() itself. A newly-found founder
// not already in JobRadar is real, useful information — but persisting
// it is a decision for Faisal/Claude to make explicitly via save_person,
// not something a research call does silently.
export interface ResearchedFounder {
  name: string;
  title: string | null;
  bio: string | null;
  linkedinUrl: string | null;
  twitterUrl: string | null;
  // Matches an existing `people` row for this company by normalized
  // name, if one already exists (e.g. from Work at a Startup's own
  // founder scrape, Decisions Log #16) — null means this is a founder
  // JobRadar didn't already know about.
  matchedExistingPersonId: number | null;
}

export interface CompanyPeopleResearchResult {
  companyId: number;
  source: string;
  founders: ResearchedFounder[];
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export class PeopleResearchService {
  private readonly companies: CompaniesRepository;
  private readonly people: PeopleRepository;

  constructor(db: DatabaseSync) {
    this.companies = new CompaniesRepository(db);
    this.people = new PeopleRepository(db);
  }

  async researchCompanyPeople(companyId: number): Promise<CompanyPeopleResearchResult> {
    const company = this.companies.findById(companyId);
    if (!company) throw new NotFoundError("Company", companyId);

    const slug = company.slug ?? guessCompanySlug(company.name);
    const ycPage = await fetchYcCompanyPage(slug);

    if (!ycPage || !ycPage.founders || ycPage.founders.length === 0) {
      return {
        companyId,
        source: ycPage ? "self-declared (Y Combinator) — no founders listed on this page" : "not available — could not locate a Y Combinator page for this company",
        founders: [],
      };
    }

    const existingPeople = this.people.findByCompany(companyId);

    const founders: ResearchedFounder[] = ycPage.founders.map((founder) => {
      const match = existingPeople.find(
        (person) => person.name !== null && normalizeName(person.name) === normalizeName(founder.full_name),
      );
      return {
        name: founder.full_name,
        title: founder.title ?? null,
        bio: founder.founder_bio ?? null,
        linkedinUrl: founder.linkedin_url ?? null,
        twitterUrl: founder.twitter_url ?? null,
        matchedExistingPersonId: match?.id ?? null,
      };
    });

    return { companyId, source: "self-declared (Y Combinator)", founders };
  }
}

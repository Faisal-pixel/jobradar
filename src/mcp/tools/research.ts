import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import type { McpServer } from "@modelcontextprotocol/server";
import { CompanyResearchService } from "../../services/company-research/company-research-service.js";
import { PeopleResearchService } from "../../services/people-research/people-research-service.js";
import { JobResearchService } from "../../services/job-research/job-research-service.js";
import { toolResult, toolError } from "../tool-helpers.js";
import { NotFoundError } from "../../shared/errors.js";

// Phase 9 — the three tools explicitly skipped in Phase 7 (Decisions Log
// #58). All three make live outbound requests (Y Combinator's company
// pages, and GitHub's public API when a company has self-declared a
// GitHub link) — on-demand only, never scheduled, same "ask before you
// fetch" spirit as everything else Claude-triggered in this app.
export function registerResearchTools(server: McpServer, db: DatabaseSync): void {
  const companyResearch = new CompanyResearchService(db);
  const peopleResearch = new PeopleResearchService(db);
  const jobResearch = new JobResearchService(db);

  server.registerTool(
    "research_company",
    {
      title: "Research Company",
      description:
        "Look up richer company detail than get_company has on file: self-declared tech stack, hiring blurb, " +
        "and social links from Work at a Startup, plus Y Combinator's own company page (LinkedIn, Twitter, " +
        "GitHub, Crunchbase link, tags, founding year, active/inactive status), plus a public GitHub signal " +
        "when the company has declared a GitHub org. Funding is not researched — CLAUDE.md's Decisions Log " +
        "explicitly scopes that out (name-based lookups on funding databases risk misattributing another " +
        "company's data). Every field says exactly where it came from, and is null with a stated reason when " +
        "nothing was found — never a guess.",
      inputSchema: z.object({ companyId: z.number() }),
    },
    async ({ companyId }) => {
      try {
        return toolResult(await companyResearch.researchCompany(companyId));
      } catch (cause) {
        if (cause instanceof NotFoundError) return toolError(cause.message);
        throw cause;
      }
    },
  );

  server.registerTool(
    "research_company_people",
    {
      title: "Research Company People",
      description:
        "Look up a company's founders from Y Combinator's own company page (name, title, bio, LinkedIn, " +
        "Twitter) and cross-reference them against people JobRadar already knows about for this company. " +
        "Founders only — recruiters/engineers aren't published by this source, and this tool does not scrape " +
        "LinkedIn. Read-only: it does not save anything it finds — use save_person for that.",
      inputSchema: z.object({ companyId: z.number() }),
    },
    async ({ companyId }) => {
      try {
        return toolResult(await peopleResearch.researchCompanyPeople(companyId));
      } catch (cause) {
        if (cause instanceof NotFoundError) return toolError(cause.message);
        throw cause;
      }
    },
  );

  server.registerTool(
    "research_job",
    {
      title: "Research Job",
      description:
        "Re-fetch a job's live posting and report whether it's still up, and what's changed since it was " +
        "discovered (title, location, salary). Read-only — does not update the stored Job row.",
      inputSchema: z.object({ jobId: z.number() }),
    },
    async ({ jobId }) => {
      try {
        return toolResult(await jobResearch.researchJob(jobId));
      } catch (cause) {
        if (cause instanceof NotFoundError) return toolError(cause.message);
        throw cause;
      }
    },
  );
}

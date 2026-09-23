import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import type { McpServer } from "@modelcontextprotocol/server";
import { CompaniesRepository } from "../../database/repositories/companies-repository.js";
import { JobsRepository } from "../../database/repositories/jobs-repository.js";
import { PeopleRepository } from "../../database/repositories/people-repository.js";
import { JOB_STATUSES, JOB_FIT_CATEGORIES } from "../../domain/jobs/job.js";
import { toolResult, toolError, omitUndefined } from "../tool-helpers.js";

export function registerCompanyTools(server: McpServer, db: DatabaseSync): void {
  const companies = new CompaniesRepository(db);
  const jobs = new JobsRepository(db);
  const people = new PeopleRepository(db);

  server.registerTool(
    "get_company",
    {
      title: "Get Company",
      description: "Fetch a single company by ID.",
      inputSchema: z.object({ id: z.number() }),
    },
    async ({ id }) => {
      const company = companies.findById(id);
      return company ? toolResult(company) : toolError(`Company ${id} not found.`);
    },
  );

  server.registerTool(
    "get_company_jobs",
    {
      title: "Get Company Jobs",
      description: "List jobs discovered for a specific company, optionally narrowed further by status, fit category, etc.",
      inputSchema: z.object({
        companyId: z.number(),
        status: z.enum(JOB_STATUSES).optional(),
        fitCategory: z.enum(JOB_FIT_CATEGORIES).optional(),
        minFitScore: z.number().optional(),
        remoteOnly: z.boolean().optional(),
      }),
    },
    async (filters) => toolResult(jobs.findByFilters(omitUndefined(filters))),
  );

  server.registerTool(
    "get_company_people",
    {
      title: "Get Company People",
      description: "List people (founders, engineers, recruiters, etc.) known for a specific company.",
      inputSchema: z.object({ companyId: z.number() }),
    },
    async ({ companyId }) => toolResult(people.findByCompany(companyId)),
  );
}

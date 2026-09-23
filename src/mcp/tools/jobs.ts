import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import type { McpServer } from "@modelcontextprotocol/server";
import { JobsRepository } from "../../database/repositories/jobs-repository.js";
import { ScoringPipeline } from "../../services/matching/scoring-pipeline.js";
import { JOB_STATUSES, JOB_FIT_CATEGORIES } from "../../domain/jobs/job.js";
import { toolResult, toolError, omitUndefined } from "../tool-helpers.js";
import { NotFoundError } from "../../shared/errors.js";

// No dedicated "job service" exists (or is needed) for these — findByFilters
// and findById are plain reads with zero extra logic, same as the CLI's
// search-jobs/list-jobs commands calling the repository directly.
// score_job is the one exception: it goes through ScoringPipeline because
// that's where the real (reused, not new) scoring logic and the
// status-regression protection live.
export function registerJobTools(server: McpServer, db: DatabaseSync): void {
  const jobs = new JobsRepository(db);
  const scoringPipeline = new ScoringPipeline(db);

  server.registerTool(
    "search_jobs",
    {
      title: "Search Jobs",
      description: "Search/filter discovered jobs by status, fit category, minimum fit score, remote-only, and/or company.",
      inputSchema: z.object({
        status: z.enum(JOB_STATUSES).optional(),
        fitCategory: z.enum(JOB_FIT_CATEGORIES).optional(),
        minFitScore: z.number().optional(),
        remoteOnly: z.boolean().optional(),
        companyId: z.number().optional(),
      }),
    },
    async (filters) => toolResult(jobs.findByFilters(omitUndefined(filters))),
  );

  server.registerTool(
    "get_job",
    {
      title: "Get Job",
      description: "Fetch a single job by ID, including its fit score, category, and full explanation.",
      inputSchema: z.object({ id: z.number() }),
    },
    async ({ id }) => {
      const job = jobs.findById(id);
      return job ? toolResult(job) : toolError(`Job ${id} not found.`);
    },
  );

  server.registerTool(
    "score_job",
    {
      title: "Score Job",
      description:
        "Re-score a specific job on demand using the current candidate profile and weights. Does not regress " +
        "the job's status if it has already progressed past 'new' (e.g. via a logged application).",
      inputSchema: z.object({ jobId: z.number() }),
    },
    async ({ jobId }) => {
      try {
        return toolResult(scoringPipeline.scoreOne(jobId));
      } catch (cause) {
        if (cause instanceof NotFoundError) return toolError(cause.message);
        throw cause;
      }
    },
  );
}

import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import type { McpServer } from "@modelcontextprotocol/server";
import { CandidateProfileRepository } from "../../database/repositories/candidate-profile-repository.js";
import { toolResult, toolError, omitUndefined } from "../tool-helpers.js";
import { ValidationError } from "../../shared/errors.js";

const companySizeRangeSchema = z.object({ min: z.number(), max: z.number() }).nullable();

export function registerPreferencesTools(server: McpServer, db: DatabaseSync): void {
  const candidateProfile = new CandidateProfileRepository(db);

  server.registerTool(
    "get_candidate_profile",
    {
      title: "Get Candidate Profile",
      description: "Get Faisal's candidate profile — location and job search preferences (target titles, stack, company size tiers).",
      inputSchema: z.object({}),
    },
    async () => toolResult(candidateProfile.get()),
  );

  // Same underlying row as get_candidate_profile — CLAUDE.md's practical
  // starting MCP surface names both as separate tools even though this
  // project built them as one table (Phase 3). Kept as two tools to match
  // that list rather than collapsing them (Phase 7 Decisions Log).
  server.registerTool(
    "get_job_search_preferences",
    {
      title: "Get Job Search Preferences",
      description:
        "Get Faisal's job search preferences (target titles, stack interest, company size tiers). Reads the same " +
        "underlying data as get_candidate_profile.",
      inputSchema: z.object({}),
    },
    async () => toolResult(candidateProfile.get()),
  );

  server.registerTool(
    "update_job_search_preferences",
    {
      title: "Update Job Search Preferences",
      description: "Update one or more fields of the candidate profile / job search preferences.",
      inputSchema: z.object({
        location: z.string().nullable().optional(),
        location_code: z.string().nullable().optional(),
        target_titles: z.array(z.string()).optional(),
        stack_interest: z.array(z.string()).optional(),
        company_size_sweet_spot: companySizeRangeSchema.optional(),
        company_size_secondary: companySizeRangeSchema.optional(),
        company_size_opportunistic: companySizeRangeSchema.optional(),
        prefer_recent_yc_batch: z.boolean().optional(),
        notes: z.string().nullable().optional(),
      }),
    },
    async (patch) => {
      try {
        return toolResult(candidateProfile.update(omitUndefined(patch)));
      } catch (cause) {
        if (cause instanceof ValidationError) return toolError(cause.message);
        throw cause;
      }
    },
  );
}

import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import type { McpServer } from "@modelcontextprotocol/server";
import { ApplicationsRepository } from "../../database/repositories/applications-repository.js";
import { ApplicationService } from "../../services/applications/application-service.js";
import { APPLICATION_STATUSES } from "../../domain/applications/application.js";
import { toolResult, toolError, omitUndefined } from "../tool-helpers.js";
import { NotFoundError, ValidationError } from "../../shared/errors.js";

export function registerApplicationTools(server: McpServer, db: DatabaseSync): void {
  const applications = new ApplicationsRepository(db);
  const applicationService = new ApplicationService(db);

  server.registerTool(
    "list_applications",
    {
      title: "List Applications",
      description: "List tracked applications, optionally filtered by status, job, or company.",
      inputSchema: z.object({
        status: z.enum(APPLICATION_STATUSES).optional(),
        jobId: z.number().optional(),
        companyId: z.number().optional(),
      }),
    },
    async (filters) => toolResult(applications.findByFilters(omitUndefined(filters))),
  );

  server.registerTool(
    "update_application",
    {
      title: "Update Application",
      description:
        "Update an existing application's status or details. Any status can be set at any time — no enforced " +
        "sequence (Phase 6 Decisions Log #44). Updating status also nudges the linked Job's status forward where " +
        "the mapping is unambiguous (Phase 6 Decisions Log #42).",
      inputSchema: z.object({
        id: z.number(),
        status: z.enum(APPLICATION_STATUSES).optional(),
        role: z.string().nullable().optional(),
        application_url: z.string().nullable().optional(),
        date_applied: z.string().nullable().optional(),
        interview_stage: z.string().nullable().optional(),
        rejection_reason: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }),
    },
    async ({ id, ...patch }) => {
      try {
        return toolResult(applicationService.updateApplicationStatus(id, omitUndefined(patch)));
      } catch (cause) {
        if (cause instanceof NotFoundError || cause instanceof ValidationError) return toolError(cause.message);
        throw cause;
      }
    },
  );
}

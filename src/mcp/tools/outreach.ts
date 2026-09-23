import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import type { McpServer } from "@modelcontextprotocol/server";
import { OutreachRepository } from "../../database/repositories/outreach-repository.js";
import { OutreachService } from "../../services/outreach/outreach-service.js";
import { OUTREACH_STATUSES, OUTREACH_CHANNELS } from "../../domain/outreach/outreach.js";
import { toolResult, toolError, omitUndefined } from "../tool-helpers.js";
import { NotFoundError, ValidationError } from "../../shared/errors.js";

export function registerOutreachTools(server: McpServer, db: DatabaseSync): void {
  const outreach = new OutreachRepository(db);
  const outreachService = new OutreachService(db);

  server.registerTool(
    "list_pending_outreach",
    {
      title: "List Pending Outreach",
      description:
        "List outreach that is overdue or due today for follow-up and still open (not closed/responded). " +
        "Same query Phase 5's automated follow-up alerts use — strictly the due-by-date set, not a general status filter.",
      inputSchema: z.object({}),
    },
    async () => toolResult(outreach.findDueFollowUps(new Date().toISOString().slice(0, 10))),
  );

  server.registerTool(
    "update_outreach",
    {
      title: "Update Outreach",
      description: "Update an existing outreach record's channel, status, dates, response, or notes.",
      inputSchema: z.object({
        id: z.number(),
        channel: z.enum(OUTREACH_CHANNELS).nullable().optional(),
        status: z.enum(OUTREACH_STATUSES).optional(),
        date_contacted: z.string().nullable().optional(),
        response: z.string().nullable().optional(),
        follow_up_date: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }),
    },
    async ({ id, ...patch }) => {
      try {
        return toolResult(outreachService.updateOutreach(id, omitUndefined(patch)));
      } catch (cause) {
        if (cause instanceof NotFoundError || cause instanceof ValidationError) return toolError(cause.message);
        throw cause;
      }
    },
  );
}

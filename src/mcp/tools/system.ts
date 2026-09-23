import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import type { McpServer } from "@modelcontextprotocol/server";
import { SystemHealthService } from "../../services/system/system-health-service.js";
import { toolResult } from "../tool-helpers.js";

export function registerSystemTools(server: McpServer, db: DatabaseSync): void {
  const systemHealth = new SystemHealthService(db);

  server.registerTool(
    "get_system_health",
    {
      title: "Get System Health",
      description:
        "Get a rollup of source and Google Sheets sync health. A narrow view for now (Phase 7) — expected to " +
        "broaden once Phase 10's scheduler exists.",
      inputSchema: z.object({}),
    },
    async () => toolResult(systemHealth.getSystemHealth()),
  );

  server.registerTool(
    "get_errors",
    {
      title: "Get Errors",
      description: "List current errors across sources and Google Sheets sync (entries with a non-null last_error).",
      inputSchema: z.object({}),
    },
    async () => toolResult(systemHealth.getErrors()),
  );
}

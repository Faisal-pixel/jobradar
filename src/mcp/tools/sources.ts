import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import type { McpServer } from "@modelcontextprotocol/server";
import { SourceHealthRepository } from "../../database/repositories/source-health-repository.js";
import { SourceManager } from "../../services/job-discovery/source-manager.js";
import { WorkAtAStartupSource } from "../../sources/workatastartup/index.js";
import { toolResult } from "../tool-helpers.js";

export function registerSourceTools(server: McpServer, db: DatabaseSync): void {
  const sourceHealth = new SourceHealthRepository(db);

  server.registerTool(
    "get_source_status",
    {
      title: "Get Source Status",
      description: "Get health status for job sources (healthy/degraded/failing, last success/failure, consecutive failures).",
      inputSchema: z.object({}),
    },
    async () => toolResult(sourceHealth.list()),
  );

  server.registerTool(
    "run_source",
    {
      title: "Run Source",
      description: "Run job discovery now for all configured sources (currently just Work at a Startup).",
      inputSchema: z.object({}),
    },
    async () => {
      const manager = new SourceManager(db, [new WorkAtAStartupSource()]);
      return toolResult(await manager.runAll());
    },
  );

  server.registerTool(
    "retry_failed_source",
    {
      title: "Retry Failed Source",
      description:
        "Retry job discovery for sources currently in a failing state. With only one source configured " +
        "today, this is functionally identical to run_source — kept as a distinct tool for when multiple " +
        "sources exist (Phase 13) and selective retry becomes meaningful.",
      inputSchema: z.object({}),
    },
    async () => {
      const manager = new SourceManager(db, [new WorkAtAStartupSource()]);
      return toolResult(await manager.runAll());
    },
  );
}
